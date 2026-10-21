import type { BookmarkSaveFailure } from "../../controllers/bookmark-persistence.mjs";
import type { BookmarkImportPreview, StorageActionFailure } from "../../controllers/storage.mjs";
import type { BookmarkImportPreviewEntry } from "../../lib/storage/bookmark-transfer.mjs";
import type { BookmarkTransferDialogOption, BookmarkTransferSelectionState } from "./transfer-dialog.mjs";

/**
 * 数値を 2 桁表記へ整える。
 * @param {number} value
 * @returns {string}
 */
function padDatePart(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * ブックマークエクスポートの既定ファイル名を作る。
 * @param {Date} date
 * @returns {string}
 */
export function buildBookmarkExportFileName(date: Date): string {
    const year = date.getFullYear();
    const month = padDatePart(date.getMonth() + 1);
    const day = padDatePart(date.getDate());
    return `knksongs-bookmarks-${year}${month}${day}.json`;
}

/**
 * テキストを JSON ファイルとして保存する。
 * @param {string} text
 * @param {string} fileName
 * @param {string} mimeType
 */
export async function saveTextFile(text: string, fileName: string, mimeType: string): Promise<void> {
    const blob = new Blob([text], { type: mimeType });
    const savePicker = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function"
        ? window.showSaveFilePicker.bind(window)
        : null;
    if (savePicker) {
        const handle = await savePicker({
            suggestedName: fileName,
            types: [
                {
                    description: "JSON",
                    accept: {
                        "application/json": [".json"]
                    }
                }
            ]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 選択されたファイルのテキスト内容を読み込む。
 * @param {{ text?: () => Promise<string> } | Blob} file
 * @returns {Promise<string>}
 */
export function readFileText(file: { text?: () => Promise<string> } | Blob): Promise<string> {
    if (file && typeof file.text === "function") {
        return file.text();
    }
    return new Promise((resolve, reject) => {
        if (typeof FileReader !== "function") {
            reject(new Error("FileReader is unavailable"));
            return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result || "")));
        reader.addEventListener("error", () => reject(reader.error || new Error("Failed to read file")));
        reader.readAsText(file as Blob);
    });
}

/**
 * 追加でブックマーク数の上限を超えるときの表示メッセージを返す。
 * @param limit ブックマーク数の上限
 * @param available あと追加できる件数
 */
export function buildBookmarkImportCountLimitMessage(limit: number, available: number): string {
    return available > 0
        ? `ブックマークは最大${limit}件です。追加できるのはあと${available}件です。`
        : `ブックマークは最大${limit}件です。追加するには、不要なブックマークを削除してください。`;
}

/**
 * インポート失敗時の理由に応じた表示メッセージを返す。
 * @param result 解析・検証・保存のいずれかの失敗
 */
export function getBookmarkImportErrorMessage(result: StorageActionFailure): string {
    if (result.reason === "max_import_file_size") {
        return `インポートできるファイルは最大${result.limit / 1_000_000} MBです。`;
    }
    if (result.reason === "songs_not_ready") {
        return "曲データの読み込みが終わってから、もう一度お試しください。";
    }
    if (result.reason === "import_exceeds_bookmark_count") {
        return buildBookmarkImportCountLimitMessage(result.limit, result.available);
    }
    if (result.reason === "import_exceeds_total_size") {
        return `インポート後のブックマーク全体が${result.limit / 1_000_000} MBを超えるため、インポートできません。選ぶブックマークを減らしてください。`;
    }
    if (result.reason === "unsupported_storage_version") {
        return "このアプリより新しい形式のブックマークが保存されているため、追加・上書きはできません。";
    }
    if (result.reason === "storage_reload_required") {
        return "別のタブでブックマークが更新された可能性があります。画面を再読み込みしてから、もう一度お試しください。";
    }
    if (result.reason === "invalid_json") {
        return "JSONとして読み込めないファイルです。";
    }
    if (result.reason === "invalid_bookmark_file" || result.reason === "invalid_text") {
        return "ブックマークの形式ではないファイルです。";
    }
    if (result.reason === "unsupported_version") {
        return "このアプリより新しい形式のブックマークファイルは読み込めません。";
    }
    if (result.reason === "storage_write_failed") {
        return "インポートしたブックマークを保存できませんでした。";
    }
    if (result.reason === "max_bookmark_count") {
        const limit = Number.isFinite(result.limit) ? result.limit : null;
        return limit === null
            ? "インポートできるブックマーク数の上限を超えています。"
            : `インポートできるブックマークは最大${limit}件です。`;
    }
    if (result.reason === "max_bookmark_name_length") {
        const limit = Number.isFinite(result.limit) ? result.limit : null;
        return limit === null
            ? "インポートできるブックマーク名の文字数上限を超えています。"
            : `ブックマーク名は最大${limit}文字までです。`;
    }
    if (result.reason === "max_songs_per_bookmark") {
        const limit = Number.isFinite(result.limit) ? result.limit : null;
        const name = "bookmarkName" in result && result.bookmarkName
            ? `「${result.bookmarkName}」は`
            : "1つのブックマークに";
        return limit === null
            ? `${name}登録できる曲数の上限を超えています。`
            : `${name}最大${limit}曲までです。`;
    }
    return "ブックマークファイルを読み込めませんでした。";
}

/**
 * ブックマーク全体を置換する前の確認メッセージを作る。消える件数も示す。
 * @param preview ファイル内と手元の件数
 */
export function buildBookmarkImportConfirmMessage(
    preview: Pick<BookmarkImportPreview, "bookmarkCount" | "songCount" | "currentBookmarkCount">
): string {
    const bookmarkCount = Number.isFinite(preview.bookmarkCount) ? preview.bookmarkCount : 0;
    const songCount = Number.isFinite(preview.songCount) ? preview.songCount : 0;
    const currentBookmarkCount = Number.isFinite(preview.currentBookmarkCount) ? preview.currentBookmarkCount : 0;
    return [
        "現在のブックマークをすべて削除し、ファイルの内容で置換します。",
        ...(currentBookmarkCount > 0 ? [`削除するブックマーク：${currentBookmarkCount}件`] : []),
        `置換後のブックマーク：${bookmarkCount}件（${songCount}曲）`,
        "よろしいですか？"
    ].join("\n");
}

/**
 * ブックマーク全体の置換を選んでいる間、決定ボタンの上に出す結果の説明を作る。
 * @param preview ファイル内と手元の件数
 */
export function buildBookmarkReplaceMessage(
    preview: Pick<BookmarkImportPreview, "bookmarkCount" | "currentBookmarkCount">
): string {
    return preview.currentBookmarkCount > 0
        ? `今ある${preview.currentBookmarkCount}件を削除し、ファイルの${preview.bookmarkCount}件で置換します。`
        : `ファイルの${preview.bookmarkCount}件で置換します。`;
}

/**
 * ブックマーク全体を置換した結果のメッセージを作る。
 * @param bookmarkCount 置換後のブックマーク数
 */
export function buildBookmarkReplaceResultMessage(bookmarkCount: number): string {
    return `ブックマークを、ファイルの${bookmarkCount}件で置換しました。`;
}

/**
 * 追加・上書きを妨げる保存データの状態を、インポート確認画面の注意として返す。
 * @param blocker 保存前の検査で見つかった状態
 */
export function getBookmarkMergeBlockerMessage(blocker: BookmarkSaveFailure): string {
    if (blocker.reason === "unsupported_storage_version") {
        return "このアプリより新しい形式のブックマークが保存されているため、追加・上書きはできません。「インポート」の ▼ から「ブックマーク全体を置換」を選ぶと、ファイルの内容で置換できます。";
    }
    if (blocker.reason === "storage_reload_required") {
        return "別のタブでブックマークが更新された可能性があります。追加・上書きするには、画面を再読み込みしてから、もう一度お試しください。";
    }
    return "ブックマークを保存できない状態のため、追加・上書きはできません。ブラウザのストレージ設定をご確認ください。";
}

/**
 * ファイル内のブックマーク 1 件を、手元との関係が分かる選択肢にする。
 * 中身が同じものと、追加・上書きできない状態のときは選べなくする。
 * @param entry 手元と照合したファイル内のブックマーク
 * @param mergeBlocked 追加・上書きを妨げる状態があるかどうか
 */
export function buildBookmarkImportOption(
    entry: BookmarkImportPreviewEntry,
    mergeBlocked: boolean
): BookmarkTransferDialogOption {
    const disabled = mergeBlocked || entry.status === "unchanged";
    const option = {
        id: entry.id,
        name: entry.name,
        checked: !disabled,
        disabled
    };
    if (entry.status === "new") {
        return {
            ...option,
            badge: "新規",
            details: [
                `${entry.songCount}曲`,
                ...(entry.hasSameNameBookmark ? ["同じ名前のブックマークがあります"] : [])
            ]
        };
    }
    if (entry.status === "unchanged") {
        return { ...option, badge: "変更なし", details: [`${entry.songCount}曲`] };
    }
    const { addedSongCount, removedSongCount, orderChanged, previousName } = entry.changes;
    const songChanges = [
        ...(addedSongCount > 0 ? [`${addedSongCount}曲追加`] : []),
        ...(removedSongCount > 0 ? [`${removedSongCount}曲削除`] : []),
        ...(orderChanged ? ["並び順の変更"] : [])
    ];
    return {
        ...option,
        badge: "上書き",
        badgeIsCaution: true,
        details: [
            songChanges.length > 0
                ? `${entry.songCount}曲（${songChanges.join("、")}）`
                : `${entry.songCount}曲`,
            ...(previousName !== null ? [`名前が「${previousName}」から変わります`] : [])
        ]
    };
}

/**
 * 選んだインポート候補の件数から、決定ボタンの状態と文言を決める。追加後の件数の上限も確かめる。
 * @param preview 手元と照合したファイルの内容
 * @param selectedIds 選んだファイル内のブックマーク ID
 */
export function buildBookmarkImportSelectionState(
    preview: Pick<BookmarkImportPreview, "entries" | "currentBookmarkCount" | "maxBookmarkCount" | "mergeBlocker">,
    selectedIds: readonly string[]
): BookmarkTransferSelectionState {
    if (preview.mergeBlocker) return { message: "", isError: false, canSubmit: false };
    const selected = new Set(selectedIds);
    const selectedEntries = preview.entries.filter((entry) => selected.has(entry.id));
    const addedCount = selectedEntries.filter((entry) => entry.status === "new").length;
    const updatedCount = selectedEntries.filter((entry) => entry.status === "update").length;
    if (addedCount + updatedCount === 0) {
        return { message: "インポートするブックマークを選んでください。", isError: false, canSubmit: false };
    }
    const available = Math.max(0, preview.maxBookmarkCount - preview.currentBookmarkCount);
    if (addedCount > available) {
        return {
            message: buildBookmarkImportCountLimitMessage(preview.maxBookmarkCount, available),
            isError: true,
            canSubmit: false
        };
    }
    return {
        message: [
            ...(addedCount > 0 ? [`${addedCount}件を追加`] : []),
            ...(updatedCount > 0 ? [`${updatedCount}件を上書き`] : [])
        ].join("・"),
        isError: false,
        canSubmit: true
    };
}

/**
 * 選んだブックマークの件数から、エクスポートの決定ボタンの状態と文言を決める。
 * @param selectedIds 選んだブックマーク ID
 */
export function buildBookmarkExportSelectionState(selectedIds: readonly string[]): BookmarkTransferSelectionState {
    return selectedIds.length > 0
        ? { message: `${selectedIds.length}件を選択中`, isError: false, canSubmit: true }
        : { message: "エクスポートするブックマークを選んでください。", isError: false, canSubmit: false };
}

/**
 * 選んで取り込んだ結果を、追加と上書きの件数で伝えるメッセージにする。
 * @param result 追加・上書きした件数
 */
export function buildBookmarkImportResultMessage(result: { addedCount: number; updatedCount: number }): string {
    const { addedCount, updatedCount } = result;
    if (addedCount > 0 && updatedCount > 0) {
        return `ブックマークを${addedCount}件追加し、${updatedCount}件上書きしました。`;
    }
    if (addedCount > 0) return `ブックマークを${addedCount}件追加しました。`;
    if (updatedCount > 0) return `ブックマークを${updatedCount}件上書きしました。`;
    return "ブックマークに変更はありませんでした。";
}
