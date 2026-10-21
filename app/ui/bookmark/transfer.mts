import {
    buildBookmarkExportFileName,
    buildBookmarkExportSelectionState,
    buildBookmarkImportConfirmMessage,
    buildBookmarkImportOption,
    buildBookmarkImportResultMessage,
    buildBookmarkImportSelectionState,
    buildBookmarkReplaceMessage,
    buildBookmarkReplaceResultMessage,
    getBookmarkImportErrorMessage,
    getBookmarkMergeBlockerMessage,
    readFileText,
    saveTextFile
} from "./import-export.mjs";
import { getBookmarkIdsInListOrder, setBookmarkPanelError } from "./panel.mjs";
import { createBookmarkTransferDialogController } from "./transfer-dialog.mjs";
import type { OpenBookmarkTransferDialog } from "./transfer-dialog.mjs";
import { MAX_BOOKMARK_IMPORT_BYTES } from "../../lib/storage/bookmark-transfer.mjs";
import type { AppDataState, AppUiElements } from "../../state.types";
import type { BookmarkImportPreview, StorageActionResult } from "../../controllers/storage.mjs";

/** エクスポート・インポートから状態管理へ委譲する処理と、差し替えられる入出力。 */
export type BookmarkTransferCallbacks = {
    onExportBookmarks: (bookmarkIds: string[]) => StorageActionResult<{ ok: true; text: string; fileName?: string }>;
    onPreviewBookmarkImport: (text: string) => StorageActionResult<BookmarkImportPreview>;
    /** 選んだブックマークだけを取り込み、同じ ID は上書き、新しい ID は追加する。 */
    onImportSelectedBookmarks: (
        text: string,
        bookmarkIds: string[]
    ) => StorageActionResult<{ ok: true; addedCount: number; updatedCount: number }>;
    /** 今あるブックマークをすべて削除し、ファイルの内容で置換する。 */
    onReplaceAllBookmarks: (text: string) => StorageActionResult<{ ok: true; bookmarkCount: number; songCount: number }>;
    saveTextFile?: (text: string, fileName: string, mimeType: string) => Promise<void> | void;
    /** ブックマークを選ぶダイアログ。省略時は body に作るモーダルダイアログを使う。 */
    openTransferDialog?: OpenBookmarkTransferDialog;
};

type BookmarkTransferControllerInput = {
    data: Pick<AppDataState, "bookmarks">;
    ui: {
        el: Pick<AppUiElements,
            "bookmarkPanelExportBtn" | "bookmarkPanelImportBtn" | "bookmarkPanelImportInput" | "bookmarkPanelError"
        >;
    };
    callbacks: BookmarkTransferCallbacks;
};

/**
 * ブックマークパネルのエクスポート・インポートを扱う controller を作成する。
 * 一覧の操作とは分け、ダイアログでの選択、ファイルの読み書き、取り込み方の分岐、結果の通知をまとめる。
 * 失敗の理由は、一覧の作成欄と共有するパネル上部のエラー欄に出す。
 */
export function createBookmarkTransferController({ data, ui, callbacks }: BookmarkTransferControllerInput) {
    const {
        onExportBookmarks,
        onPreviewBookmarkImport,
        onImportSelectedBookmarks,
        onReplaceAllBookmarks,
        saveTextFile: saveTextFileCallback = saveTextFile,
        openTransferDialog = createBookmarkTransferDialogController().open
    } = callbacks;

    /**
     * パネル上部のエラー欄に、エクスポート・インポートの失敗を出す。
     * @param message 表示する文言
     */
    function showBookmarkPanelError(message: string): void {
        setBookmarkPanelError(ui.el.bookmarkPanelError, message);
    }

    /**
     * パネル上部のエラー欄を消す。
     */
    function clearBookmarkPanelError(): void {
        showBookmarkPanelError("");
    }

    /**
     * 書き出すブックマークをダイアログで選ばせ、選んだものを JSON ファイルとして保存する。
     * 保存先の選択はダイアログを閉じてから開き、取り消された場合は何もしない。
     */
    async function exportBookmarksFromPanel() {
        clearBookmarkPanelError();
        const sortedIds = getBookmarkIdsInListOrder(data.bookmarks);
        if (sortedIds.length === 0) {
            showBookmarkPanelError("エクスポートできるブックマークがありません。");
            return;
        }
        const selectedIds = await openTransferDialog<string[]>({
            title: "ブックマークのエクスポート",
            description: "エクスポートするブックマークを選んでください。",
            options: sortedIds.map((bookmarkId) => ({
                id: bookmarkId,
                name: data.bookmarks[bookmarkId].name,
                details: [`${data.bookmarks[bookmarkId].songs.length}曲`],
                checked: true,
                disabled: false
            })),
            submitLabel: "エクスポート",
            describeSelection: buildBookmarkExportSelectionState,
            onSubmit: (bookmarkIds) => ({ ok: true, value: bookmarkIds }),
            returnFocusEl: ui.el.bookmarkPanelExportBtn
        });
        if (!selectedIds) return;
        try {
            const result = onExportBookmarks(selectedIds);
            if (result.ok === false) {
                showBookmarkPanelError("ブックマークをエクスポートできませんでした。");
                return;
            }
            const fileName = typeof result.fileName === "string" && result.fileName.trim()
                ? result.fileName.trim()
                : buildBookmarkExportFileName(new Date());
            await saveTextFileCallback(result.text, fileName, "application/json");
        } catch (error) {
            if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return;
            showBookmarkPanelError("ブックマークをエクスポートできませんでした。");
        }
    }

    /**
     * ファイル選択ダイアログを開く。
     */
    function requestBookmarkImportFile() {
        const input = ui.el.bookmarkPanelImportInput;
        if (!input) return;
        clearBookmarkPanelError();
        input.value = "";
        input.click();
    }

    /**
     * 読み込んだファイルの内容を手元と照合してダイアログに並べ、選んだブックマークを取り込む。
     * 選んだものは同じ ID なら上書き、新しい ID なら追加する。
     * 「インポート」の ▼ でブックマーク全体の置換へ切り替えると、選択を使わずファイルの内容で置換する。
     * @param text ファイルから読み込んだ文字列
     * @param preview 手元と照合したファイルの内容
     * @returns 取り込んだ結果のメッセージ。取り消した場合は null
     */
    function chooseBookmarksToImport(text: string, preview: BookmarkImportPreview): Promise<string | null> {
        const mergeBlocked = preview.mergeBlocker !== null;
        return openTransferDialog<string>({
            title: "ブックマークのインポート",
            description: "インポートするブックマークを選んでください。手元にある同じブックマークは、ファイルの内容で上書きします。",
            notice: preview.mergeBlocker ? getBookmarkMergeBlockerMessage(preview.mergeBlocker) : undefined,
            options: preview.entries.map((entry) => buildBookmarkImportOption(entry, mergeBlocked)),
            submitLabel: "インポート",
            describeSelection: (bookmarkIds) => buildBookmarkImportSelectionState(preview, bookmarkIds),
            onSubmit: (bookmarkIds) => {
                const result = onImportSelectedBookmarks(text, bookmarkIds);
                if (result.ok === false) return { ok: false, message: getBookmarkImportErrorMessage(result) };
                return { ok: true, value: buildBookmarkImportResultMessage(result) };
            },
            allItemsAction: {
                menuLabel: "取り込み方を選ぶ",
                selectionItem: {
                    label: "選んだブックマークを取り込む",
                    description: "同じものは上書きし、ほかは残します"
                },
                allItemsItem: {
                    label: "ブックマーク全体を置換",
                    description: "今あるブックマークはすべて削除します"
                },
                description: "今あるブックマークをすべて削除し、ファイルのブックマークだけにします。",
                submitLabel: "置換",
                message: buildBookmarkReplaceMessage(preview),
                run: () => {
                    if (!confirm(buildBookmarkImportConfirmMessage(preview))) return { ok: false, message: "" };
                    const result = onReplaceAllBookmarks(text);
                    if (result.ok === false) return { ok: false, message: getBookmarkImportErrorMessage(result) };
                    return { ok: true, value: buildBookmarkReplaceResultMessage(result.bookmarkCount) };
                }
            },
            returnFocusEl: ui.el.bookmarkPanelImportBtn
        });
    }

    /**
     * 選択された JSON ファイルを読み込み、取り込むブックマークを選ばせる。
     */
    async function importBookmarksFromSelectedFile() {
        const input = ui.el.bookmarkPanelImportInput;
        if (!input) return;
        const file = input.files?.[0] ?? null;
        if (!file) return;

        clearBookmarkPanelError();
        try {
            if (file.size > MAX_BOOKMARK_IMPORT_BYTES) {
                showBookmarkPanelError(getBookmarkImportErrorMessage({
                    ok: false,
                    reason: "max_import_file_size",
                    limit: MAX_BOOKMARK_IMPORT_BYTES
                }));
                return;
            }
            const text = await readFileText(file);
            const preview = onPreviewBookmarkImport(text);
            if (preview.ok === false) {
                showBookmarkPanelError(getBookmarkImportErrorMessage(preview));
                return;
            }
            if (preview.entries.length === 0) {
                showBookmarkPanelError("インポートできるブックマークがファイルにありません。");
                return;
            }
            const resultMessage = await chooseBookmarksToImport(text, preview);
            if (resultMessage) alert(resultMessage);
        } catch {
            showBookmarkPanelError("ブックマークファイルを読み込めませんでした。");
        } finally {
            input.value = "";
        }
    }

    /**
     * エクスポート・インポートのボタンとファイル選択のイベントを登録する。
     */
    function setupTransferHandlers(): void {
        const exportBtn = ui.el.bookmarkPanelExportBtn;
        const importBtn = ui.el.bookmarkPanelImportBtn;
        const importInput = ui.el.bookmarkPanelImportInput;
        if (exportBtn) {
            exportBtn.addEventListener("click", exportBookmarksFromPanel);
        }
        if (importBtn) {
            importBtn.addEventListener("click", requestBookmarkImportFile);
        }
        if (importInput) {
            importInput.addEventListener("change", importBookmarksFromSelectedFile);
        }
    }

    return { setupTransferHandlers };
}
