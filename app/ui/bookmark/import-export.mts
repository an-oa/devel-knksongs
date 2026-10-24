import type { BookmarkSaveFailure } from "../../controllers/bookmark-persistence.mjs";
import type { BookmarkImportPreview, StorageActionFailure } from "../../controllers/storage.mjs";
import type { BookmarkImportPreviewEntry } from "../../lib/storage/bookmark-transfer.mjs";
import type { BookmarkTransferDialogOption, BookmarkTransferSelectionState } from "./transfer-dialog.mjs";
import type { SiteLanguage } from "../../lib/site-language.mjs";
import { getBookmarkText } from "./text.mjs";

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
 * @param language 文言の言語
 */
export function buildBookmarkImportCountLimitMessage(limit: number, available: number, language: SiteLanguage): string {
    return getBookmarkText(language).importCountLimit(limit, available);
}

/**
 * 有限の上限値だけを返す。上限が分からないときは null にし、上限を書かない文言を選ぶ。
 * @param limit 上限値
 * @returns 有限の上限値、または null
 */
function toFiniteLimit(limit: number): number | null {
    return Number.isFinite(limit) ? limit : null;
}

/**
 * インポート失敗時の理由に応じた表示メッセージを返す。
 * @param result 解析・検証・保存のいずれかの失敗
 * @param language 文言の言語
 */
export function getBookmarkImportErrorMessage(result: StorageActionFailure, language: SiteLanguage): string {
    const text = getBookmarkText(language);
    if (result.reason === "max_import_file_size") {
        return text.maxImportFileSize(result.limit / 1_000_000);
    }
    if (result.reason === "songs_not_ready") {
        return text.songsNotReady;
    }
    if (result.reason === "import_exceeds_bookmark_count") {
        return buildBookmarkImportCountLimitMessage(result.limit, result.available, language);
    }
    if (result.reason === "import_exceeds_total_size") {
        return text.importExceedsTotalSize(result.limit / 1_000_000);
    }
    if (result.reason === "unsupported_storage_version") {
        return text.importNewerStorage;
    }
    if (result.reason === "storage_reload_required") {
        return text.reloadRequired;
    }
    if (result.reason === "invalid_json") {
        return text.invalidJson;
    }
    if (result.reason === "invalid_bookmark_file" || result.reason === "invalid_text") {
        return text.invalidBookmarkFile;
    }
    if (result.reason === "unsupported_version") {
        return text.unsupportedVersion;
    }
    if (result.reason === "storage_write_failed") {
        return text.importSaveFailed;
    }
    if (result.reason === "max_bookmark_count") {
        return text.importMaxBookmarkCount(toFiniteLimit(result.limit));
    }
    if (result.reason === "max_bookmark_name_length") {
        return text.importMaxNameLength(toFiniteLimit(result.limit));
    }
    if (result.reason === "max_songs_per_bookmark") {
        const bookmarkName = "bookmarkName" in result && result.bookmarkName ? result.bookmarkName : null;
        return text.importMaxSongs(bookmarkName, toFiniteLimit(result.limit));
    }
    return text.readFailed;
}

/**
 * ブックマーク全体を置換する前の確認メッセージを作る。消える件数も示す。
 * @param preview ファイル内と手元の件数
 * @param language 文言の言語
 */
export function buildBookmarkImportConfirmMessage(
    preview: Pick<BookmarkImportPreview, "bookmarkCount" | "songCount" | "currentBookmarkCount">,
    language: SiteLanguage
): string {
    const bookmarkCount = Number.isFinite(preview.bookmarkCount) ? preview.bookmarkCount : 0;
    const songCount = Number.isFinite(preview.songCount) ? preview.songCount : 0;
    const currentBookmarkCount = Number.isFinite(preview.currentBookmarkCount) ? preview.currentBookmarkCount : 0;
    return getBookmarkText(language).replaceConfirm(currentBookmarkCount, bookmarkCount, songCount);
}

/**
 * ブックマーク全体の置換を選んでいる間、決定ボタンの上に出す結果の説明を作る。
 * @param preview ファイル内と手元の件数
 * @param language 文言の言語
 */
export function buildBookmarkReplaceMessage(
    preview: Pick<BookmarkImportPreview, "bookmarkCount" | "currentBookmarkCount">,
    language: SiteLanguage
): string {
    return getBookmarkText(language).replaceMessage(preview.currentBookmarkCount, preview.bookmarkCount);
}

/**
 * ブックマーク全体を置換した結果のメッセージを作る。
 * @param bookmarkCount 置換後のブックマーク数
 * @param language 文言の言語
 */
export function buildBookmarkReplaceResultMessage(bookmarkCount: number, language: SiteLanguage): string {
    return getBookmarkText(language).replaceResult(bookmarkCount);
}

/**
 * 追加・上書きを妨げる保存データの状態を、インポート確認画面の注意として返す。
 * @param blocker 保存前の検査で見つかった状態
 * @param language 文言の言語
 */
export function getBookmarkMergeBlockerMessage(blocker: BookmarkSaveFailure, language: SiteLanguage): string {
    const text = getBookmarkText(language);
    if (blocker.reason === "unsupported_storage_version") return text.mergeBlockedByNewerStorage;
    if (blocker.reason === "storage_reload_required") return text.mergeBlockedByReload;
    return text.mergeBlockedBySaveFailure;
}

/**
 * ファイル内のブックマーク 1 件を、手元との関係が分かる選択肢にする。
 * 中身が同じものと、追加・上書きできない状態のときは選べなくする。
 * @param entry 手元と照合したファイル内のブックマーク
 * @param mergeBlocked 追加・上書きを妨げる状態があるかどうか
 * @param language 文言の言語
 */
export function buildBookmarkImportOption(
    entry: BookmarkImportPreviewEntry,
    mergeBlocked: boolean,
    language: SiteLanguage
): BookmarkTransferDialogOption {
    const text = getBookmarkText(language);
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
            badge: text.badgeNew,
            details: [
                text.songCount(entry.songCount),
                ...(entry.hasSameNameBookmark ? [text.sameNameExists] : [])
            ]
        };
    }
    if (entry.status === "unchanged") {
        return { ...option, badge: text.badgeUnchanged, details: [text.songCount(entry.songCount)] };
    }
    const { addedSongCount, removedSongCount, orderChanged, previousName } = entry.changes;
    const songChanges = [
        ...(addedSongCount > 0 ? [text.songsAdded(addedSongCount)] : []),
        ...(removedSongCount > 0 ? [text.songsRemoved(removedSongCount)] : []),
        ...(orderChanged ? [text.orderChanged] : [])
    ];
    return {
        ...option,
        badge: text.badgeOverwrite,
        badgeIsCaution: true,
        details: [
            songChanges.length > 0
                ? text.songCountWithChanges(entry.songCount, songChanges)
                : text.songCount(entry.songCount),
            ...(previousName !== null ? [text.renamedFrom(previousName)] : [])
        ]
    };
}

/**
 * 選んだインポート候補の件数から、決定ボタンの状態と文言を決める。追加後の件数の上限も確かめる。
 * @param preview 手元と照合したファイルの内容
 * @param selectedIds 選んだファイル内のブックマーク ID
 * @param language 文言の言語
 */
export function buildBookmarkImportSelectionState(
    preview: Pick<BookmarkImportPreview, "entries" | "currentBookmarkCount" | "maxBookmarkCount" | "mergeBlocker">,
    selectedIds: readonly string[],
    language: SiteLanguage
): BookmarkTransferSelectionState {
    if (preview.mergeBlocker) return { message: "", isError: false, canSubmit: false };
    const text = getBookmarkText(language);
    const selected = new Set(selectedIds);
    const selectedEntries = preview.entries.filter((entry) => selected.has(entry.id));
    const addedCount = selectedEntries.filter((entry) => entry.status === "new").length;
    const updatedCount = selectedEntries.filter((entry) => entry.status === "update").length;
    if (addedCount + updatedCount === 0) {
        return { message: text.importSelectPrompt, isError: false, canSubmit: false };
    }
    const available = Math.max(0, preview.maxBookmarkCount - preview.currentBookmarkCount);
    if (addedCount > available) {
        return {
            message: buildBookmarkImportCountLimitMessage(preview.maxBookmarkCount, available, language),
            isError: true,
            canSubmit: false
        };
    }
    return {
        message: text.importSelectionSummary(addedCount, updatedCount),
        isError: false,
        canSubmit: true
    };
}

/**
 * 選んだブックマークの件数から、エクスポートの決定ボタンの状態と文言を決める。
 * @param selectedIds 選んだブックマーク ID
 * @param language 文言の言語
 */
export function buildBookmarkExportSelectionState(
    selectedIds: readonly string[],
    language: SiteLanguage
): BookmarkTransferSelectionState {
    const text = getBookmarkText(language);
    return selectedIds.length > 0
        ? { message: text.exportSelected(selectedIds.length), isError: false, canSubmit: true }
        : { message: text.exportSelectPrompt, isError: false, canSubmit: false };
}

/**
 * 選んで取り込んだ結果を、追加と上書きの件数で伝えるメッセージにする。
 * @param result 追加・上書きした件数
 * @param language 文言の言語
 */
export function buildBookmarkImportResultMessage(
    result: { addedCount: number; updatedCount: number },
    language: SiteLanguage
): string {
    return getBookmarkText(language).importResult(result.addedCount, result.updatedCount);
}
