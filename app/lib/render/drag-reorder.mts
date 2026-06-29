import { isHtmlElement } from "../dom-utils.mjs";
import type { BookmarkRecord } from "../../state.types";

type BookmarkDragReorderDataState = {
    activeBookmark: string | null;
    bookmarks: Record<string, BookmarkRecord>;
    currentResults: Song[];
};

type BookmarkDragDataTransfer = {
    setData: (format: string, data: string) => void;
    getData: (format: string) => string;
    effectAllowed: string;
};

type BookmarkDragEvent = {
    currentTarget?: EventTarget | null;
    target?: EventTarget | null;
    dataTransfer: BookmarkDragDataTransfer;
    preventDefault: () => void;
};

type BookmarkDragReorderControllerInput = {
    data: BookmarkDragReorderDataState;
    getBookmarkSongRef: (row: Song) => string | number | null | undefined;
    saveBookmarks: () => void;
    updateDisplay: () => void;
};

/**
 * イベント対象から曲カード要素を返す。
 * @param {unknown} target
 * @returns {HTMLElement | null}
 */
function getSongCardFromTarget(target: unknown): HTMLElement | null {
    if (!isHtmlElement(target)) return null;
    const card = (target as HTMLElement).closest(".song-card");
    return isHtmlElement(card) ? card as HTMLElement : null;
}

/**
 * ブックマーク表示中のカードドラッグ並べ替えを扱うコントローラーを作成する。
 * @param {{ data: *, getBookmarkSongRef: Function, saveBookmarks: Function, updateDisplay: Function }} input
 */
export function createBookmarkDragReorderController(input: BookmarkDragReorderControllerInput) {
    const { data, getBookmarkSongRef, saveBookmarks, updateDisplay } = input;

    /**
     * 現在の表示順をアクティブなブックマークの保存順へ反映する。
     * @returns {boolean}
     */
    function persistActiveBookmarkOrder(): boolean {
        if (!data.activeBookmark) return false;
        const bookmark = data.bookmarks[data.activeBookmark];
        if (!bookmark || !Array.isArray(bookmark.songs) || bookmark.songs.length === 0) return false;

        const orderedKeys = data.currentResults
            .map((row) => getBookmarkSongRef(row))
            .filter(Boolean);
        if (orderedKeys.length === 0) return false;

        const reorderSet = new Set(orderedKeys);
        const queue = orderedKeys.slice();
        const nextSongs = bookmark.songs.map((songKey) => {
            if (!reorderSet.has(songKey)) return songKey;
            return queue.length > 0 ? queue.shift() : songKey;
        });

        const changed = nextSongs.some((songKey, idx) => songKey !== bookmark.songs[idx]);
        if (!changed) return false;
        bookmark.songs = nextSongs;
        return true;
    }

    /**
     * ドラッグ開始時に対象曲キーを dataTransfer へ保存する。
     * @param {BookmarkDragEvent} event
     */
    function onDragStart(event: BookmarkDragEvent): void {
        if (!data.activeBookmark) {
            event.preventDefault();
            return;
        }
        const handle = event.currentTarget;
        if (!isHtmlElement(handle)) return;
        const card = getSongCardFromTarget(handle);
        if (!isHtmlElement(card)) return;
        const songKey = card.dataset.songKey || "";
        if (!songKey) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.setData("text/plain", songKey);
        event.dataTransfer.effectAllowed = "move";
        card.classList.add("dragging");
    }

    /**
     * ドラッグ終了時の一時スタイルを解除する。
     * @param {BookmarkDragEvent} event
     */
    function onDragEnd(event: BookmarkDragEvent): void {
        const handle = event.currentTarget;
        if (!isHtmlElement(handle)) return;
        const card = getSongCardFromTarget(handle);
        if (!isHtmlElement(card)) return;
        card.classList.remove("dragging");
        card.classList.remove("drag-over");
    }

    /**
     * ドロップ候補カードのハイライトを更新する。
     * @param {BookmarkDragEvent} event
     */
    function onDragOver(event: BookmarkDragEvent): void {
        if (!data.activeBookmark) return;
        event.preventDefault();
        const targetCard = getSongCardFromTarget(event.target);
        if (!isHtmlElement(targetCard)) return;
        targetCard.classList.add("drag-over");
    }

    /**
     * ドロップ候補カードのハイライトを解除する。
     * @param {BookmarkDragEvent} event
     */
    function onDragLeave(event: BookmarkDragEvent): void {
        const targetCard = getSongCardFromTarget(event.target);
        if (!isHtmlElement(targetCard)) return;
        targetCard.classList.remove("drag-over");
    }

    /**
     * ドロップ先に合わせて結果順とブックマーク保存順を更新する。
     * @param {BookmarkDragEvent} event
     */
    function onDrop(event: BookmarkDragEvent): void {
        if (!data.activeBookmark) return;
        event.preventDefault();
        const draggedKey = event.dataTransfer.getData("text/plain");
        const targetCard = getSongCardFromTarget(event.target);
        if (!isHtmlElement(targetCard)) return;
        targetCard.classList.remove("drag-over");

        const targetKey = targetCard.dataset.songKey;
        if (draggedKey === targetKey) return;

        const fromIndex = data.currentResults.findIndex((song) => song.songKey === draggedKey);
        const toIndex = data.currentResults.findIndex((song) => song.songKey === targetKey);

        if (fromIndex === -1 || toIndex === -1) return;

        const [movedItem] = data.currentResults.splice(fromIndex, 1);
        data.currentResults.splice(toIndex, 0, movedItem);

        persistActiveBookmarkOrder();
        saveBookmarks();
        updateDisplay();
    }

    return {
        onDragStart,
        onDragEnd,
        onDragOver,
        onDragLeave,
        onDrop,
        persistActiveBookmarkOrder
    };
}
