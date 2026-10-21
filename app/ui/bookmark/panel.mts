import type { BookmarkRecord } from "../../state.types";

/**
 * ブックマークの ID を、一覧に並べる順（作成日時の古い順）で返す。
 * 一覧の描画とエクスポートの選択肢を同じ順に並べるため、両方から使う。
 * @param bookmarks 保存済みのブックマーク
 */
export function getBookmarkIdsInListOrder(bookmarks: Record<string, BookmarkRecord>): string[] {
    return Object.keys(bookmarks).sort((a, b) => {
        return (bookmarks[a].createdAt || 0) - (bookmarks[b].createdAt || 0);
    });
}

/**
 * ブックマークパネル上部のエラー欄に文言を出す。空文字なら欄を隠す。
 * 作成欄の入力エラーと、エクスポート・インポートの失敗が同じ欄を使う。
 * @param errorEl エラー欄の要素
 * @param message 表示する文言
 */
export function setBookmarkPanelError(errorEl: HTMLElement | null | undefined, message: string): void {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
}
