import { isHtmlElement } from "../dom-utils.mjs?v=11";

/**
 * イベント対象から曲カード要素を返す。
 * @param {*} target
 * @returns {*}
 */
function getSongCardFromTarget(target) {
    return isHtmlElement(target) ? target.closest(".song-card") : null;
}

/**
 * ブックマーク表示中のカードドラッグ並べ替えを扱うコントローラーを作成する。
 * @param {{ data: *, getBookmarkSongRef: Function, saveBookmarks: Function, updateDisplay: Function }} input
 */
export function createBookmarkDragReorderController(input) {
    const { data, getBookmarkSongRef, saveBookmarks, updateDisplay } = input;

    /**
     * 現在の表示順をアクティブなブックマークの保存順へ反映する。
     * @returns {boolean}
     */
    function persistActiveBookmarkOrder() {
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
     * @param {*} event
     */
    function onDragStart(event) {
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
     * @param {*} event
     */
    function onDragEnd(event) {
        const handle = event.currentTarget;
        if (!isHtmlElement(handle)) return;
        const card = getSongCardFromTarget(handle);
        if (!isHtmlElement(card)) return;
        card.classList.remove("dragging");
        card.classList.remove("drag-over");
    }

    /**
     * ドロップ候補カードのハイライトを更新する。
     * @param {*} event
     */
    function onDragOver(event) {
        if (!data.activeBookmark) return;
        event.preventDefault();
        const targetCard = getSongCardFromTarget(event.target);
        if (!isHtmlElement(targetCard)) return;
        targetCard.classList.add("drag-over");
    }

    /**
     * ドロップ候補カードのハイライトを解除する。
     * @param {*} event
     */
    function onDragLeave(event) {
        const targetCard = getSongCardFromTarget(event.target);
        if (!isHtmlElement(targetCard)) return;
        targetCard.classList.remove("drag-over");
    }

    /**
     * ドロップ先に合わせて結果順とブックマーク保存順を更新する。
     * @param {*} event
     */
    function onDrop(event) {
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
