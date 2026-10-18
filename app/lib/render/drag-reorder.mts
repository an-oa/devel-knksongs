import type { StorageActionFailure, StorageActionResult } from "../../controllers/storage.mjs";
import { isHtmlElement } from "../dom-utils.mjs";

type BookmarkDragReorderDataState = {
    activeBookmark: string | null;
};

type BookmarkDragDataTransfer = {
    setData: (format: string, data: string) => void;
    getData: (format: string) => string;
    effectAllowed: string;
};

type BookmarkDragEvent = {
    currentTarget?: EventTarget | null;
    target?: EventTarget | null;
    relatedTarget?: EventTarget | null;
    dataTransfer: BookmarkDragDataTransfer | null;
    preventDefault: () => void;
};

type BookmarkDragReorderControllerInput = {
    data: BookmarkDragReorderDataState;
    moveSongInActiveBookmark: (fromSongKey: string, toSongKey: string) => StorageActionResult<{ ok: true; changed: boolean }>;
    onSaveFailure: (result: StorageActionFailure) => void;
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
 */
export function createBookmarkDragReorderController(input: BookmarkDragReorderControllerInput) {
    const {
        data,
        moveSongInActiveBookmark,
        onSaveFailure
    } = input;
    /** ハンドルから始めた並べ替えのドラッグの間だけ、移動元の曲キーを持つ。 */
    let draggedSongKey: string | null = null;

    /**
     * ドラッグ開始時に移動元の曲キーを覚え、dataTransfer にも保存する。
     * ドロップ先の枠は、ここで覚えた並べ替えのドラッグにだけ付ける。
     * @param event ハンドルで始まった dragstart のイベント
     */
    function onDragStart(event: BookmarkDragEvent): void {
        if (!data.activeBookmark || !event.dataTransfer) {
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
        draggedSongKey = songKey;
        card.classList.add("dragging");
    }

    /**
     * ドラッグ終了時に、覚えていた移動元と一時スタイルを解除する。
     * @param event ハンドルで終わった dragend のイベント
     */
    function onDragEnd(event: BookmarkDragEvent): void {
        draggedSongKey = null;
        const handle = event.currentTarget;
        if (!isHtmlElement(handle)) return;
        const card = getSongCardFromTarget(handle);
        if (!isHtmlElement(card)) return;
        card.classList.remove("dragging");
        card.classList.remove("drag-over");
    }

    /**
     * ブックマーク表示中のカードでは、dragenter と dragover の既定動作を止めてドロップを受け付ける。
     * WebKit は dragenter も止めないと、カード内の別の要素へ入った直後に離したドロップを受け付けない。
     * ハンドル以外から始めたドラッグ（タイトルのリンクや外部のファイルなど）も、これまでどおり受け止めて何もしない。
     * 枠は、ハンドルから始めた並べ替えのドラッグで、移動元以外のカードにだけ付ける。
     * @param event dragenter または dragover のイベント
     */
    function acceptDropOnCard(event: BookmarkDragEvent): void {
        if (!data.activeBookmark) return;
        event.preventDefault();
        const targetCard = getSongCardFromTarget(event.target);
        if (!isHtmlElement(targetCard)) return;
        if (draggedSongKey === null || targetCard.dataset.songKey === draggedSongKey) return;
        targetCard.classList.add("drag-over");
    }

    /**
     * カードの外へ出たときだけ、ドロップ先の枠を外す。
     * カード内の子要素の境目を越えるときも dragleave が届くので、移る先が同じカードの中なら枠を保つ。
     * @param event dragleave のイベント。relatedTarget は移る先の要素
     */
    function onDragLeave(event: BookmarkDragEvent): void {
        const targetCard = getSongCardFromTarget(event.target);
        if (!isHtmlElement(targetCard)) return;
        const enteredElement = event.relatedTarget;
        if (isHtmlElement(enteredElement) && targetCard.contains(enteredElement)) return;
        targetCard.classList.remove("drag-over");
    }

    /**
     * 覚えていた移動元と、ドロップ先の曲キーをブックマーク操作 API へ通知する。
     * 並べ替えのドラッグでなければ、ドロップを受け止めるだけで何もしない。
     * @param event ドロップ先のカードで起きた drop のイベント
     */
    function onDrop(event: BookmarkDragEvent): void {
        if (!data.activeBookmark) return;
        event.preventDefault();
        const draggedKey = draggedSongKey;
        draggedSongKey = null;
        const targetCard = getSongCardFromTarget(event.target);
        if (!isHtmlElement(targetCard)) return;
        targetCard.classList.remove("drag-over");

        const targetKey = targetCard.dataset.songKey || "";
        if (!draggedKey || !targetKey || draggedKey === targetKey) return;
        const saveResult = moveSongInActiveBookmark(draggedKey, targetKey);
        if (saveResult.ok === false) {
            onSaveFailure(saveResult);
        }
    }

    return {
        onDragStart,
        onDragEnd,
        onDragEnter: acceptDropOnCard,
        onDragOver: acceptDropOnCard,
        onDragLeave,
        onDrop
    };
}
