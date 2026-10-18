import type { StorageActionFailure, StorageActionResult } from "../../controllers/storage.mjs";
import { isHtmlElement } from "../dom-utils.mjs";
import { animateCardReorder, captureCardPositions } from "./card-reorder-animation.mjs";
import { getSongCards } from "./masonry-layout.mjs";

/** 並べ替えた直後は、ポインタがこの距離だけ動くまで次の並べ替えをしない。 */
const PREVIEW_POINTER_THRESHOLD_PX = 8;
/** ドラッグ中にポインタに付いてくる像として使う、透明な要素の id。 */
const BLANK_DRAG_IMAGE_ID = "blankDragImage";

type BookmarkDragReorderDataState = {
    activeBookmark: string | null;
    currentResults: ReadonlyArray<{ songKey: string }>;
};

type BookmarkDragDataTransfer = {
    setData: (format: string, data: string) => void;
    getData: (format: string) => string;
    setDragImage?: (image: Element, x: number, y: number) => void;
    effectAllowed: string;
};

type BookmarkDragEvent = {
    currentTarget?: EventTarget | null;
    clientX?: number;
    clientY?: number;
    dataTransfer: BookmarkDragDataTransfer | null;
    preventDefault: () => void;
};

type BookmarkDragReorderControllerInput = {
    data: BookmarkDragReorderDataState;
    moveSongInActiveBookmark: (fromSongKey: string, toSongKey: string) => StorageActionResult<{ ok: true; changed: boolean }>;
    onSaveFailure: (result: StorageActionFailure) => void;
    /** 並べ替え途中の順序（orderForPreview）で、結果一覧を描き直す。 */
    refreshDisplay: () => void;
    /** 結果カードを並べた一覧を返す。 */
    getResultList: () => HTMLElement | null;
};

type PointInList = { x: number; y: number };

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
 * ドラッグ中にポインタに付いてくる像を、透明な 1px の要素にして見えなくする。
 * 移動元のカード自身がポインタの下の枠へ移って落ちる場所を示すので、像も出すと同じカードが二重に見える。
 * CSP の img-src で data URL の画像は読めないので、styles.css で大きさを決めた中身のない要素を初回に作り、使い回す。
 * @param event ハンドルで始まった dragstart のイベント
 */
function hideDragImage(event: BookmarkDragEvent): void {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer || typeof dataTransfer.setDragImage !== "function") return;
    if (typeof document === "undefined" || !document.body) return;
    let blank = document.getElementById(BLANK_DRAG_IMAGE_ID);
    if (!blank) {
        blank = document.createElement("div");
        blank.setAttribute("id", BLANK_DRAG_IMAGE_ID);
        blank.className = "blank-drag-image";
        blank.setAttribute("aria-hidden", "true");
        document.body.append(blank);
    }
    dataTransfer.setDragImage(blank, 0, 0);
}

/**
 * 一覧から見たポインタの位置を返す。
 * 一覧を基準にするので、ドラッグ中にページがスクロールしても、カードに対する位置の変化として扱える。
 * @param list 結果カードを並べた一覧
 * @param event ポインタの位置を持つ drag のイベント
 * @returns 一覧の左上からの位置。位置がなければ null
 */
function getPointInList(list: HTMLElement, event: BookmarkDragEvent): PointInList | null {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
    const rect = list.getBoundingClientRect();
    return { x: Number(event.clientX) - rect.left, y: Number(event.clientY) - rect.top };
}

/**
 * ポインタの下にあるカードを、スライド中の見た目ではなく、配置の位置で探す。
 * スライド中のカードは transform で動いて見えるが、offsetTop などは並べ替えた後の場所を指すので、動いている途中のカードを拾わない。
 * 本番コードでは並べ替えのプレビューから使い、位置の境界を単体テストするため export している。
 * @param list 結果カードを並べた一覧
 * @param point 一覧の左上からのポインタの位置
 * @returns ポインタの下のカード。カードの間の隙間なら null
 */
export function findCardAtPoint(list: HTMLElement, point: PointInList): HTMLElement | null {
    for (const card of getSongCards(list)) {
        const left = card.offsetLeft;
        const top = card.offsetTop;
        if (point.x >= left && point.x < left + card.offsetWidth && point.y >= top && point.y < top + card.offsetHeight) {
            return card;
        }
    }
    return null;
}

/**
 * ブックマーク表示中のカードドラッグ並べ替えを扱うコントローラーを作成する。
 * ドラッグ中は、ポインタの下のカードの位置へ移動元を移して見せ、他のカードをよけさせる（プレビュー）。
 * 保存する順序は、一覧の中で離したときに、見えている順序で確定する。一覧の外で離すと元の順序へ戻す。
 */
export function createBookmarkDragReorderController(input: BookmarkDragReorderControllerInput) {
    const {
        data,
        moveSongInActiveBookmark,
        onSaveFailure,
        refreshDisplay,
        getResultList
    } = input;
    /** ハンドルから始めた並べ替えのドラッグの間だけ、移動元の曲キーを持つ。 */
    let draggedSongKey: string | null = null;
    /** 並べ替え途中に移動元を見せている位置（表示順の index）。元の位置のままなら null。 */
    let previewIndex: number | null = null;
    /** 直前の並べ替えでよけたカード。ポインタがそのカードから出るまで、次の対象にしない。 */
    let movedAsideSongKey: string | null = null;
    /** 直前に並べ替えたときのポインタの位置。ポインタが動くまで、次の並べ替えをしない。 */
    let lastPreviewPoint: PointInList | null = null;

    /**
     * 並べ替えのドラッグの状態を、ドラッグしていない状態へ戻す。
     */
    function resetDragState(): void {
        draggedSongKey = null;
        previewIndex = null;
        movedAsideSongKey = null;
        lastPreviewPoint = null;
    }

    /**
     * 並べ替え途中の表示をやめ、保存されている順序へカードをスライドさせて戻す。
     * @param movedSongKey 戻る途中で前面に出す、移動元の曲キー
     */
    function restoreSavedOrder(movedSongKey: string): void {
        const list = getResultList();
        const previousPositions = captureCardPositions(list);
        refreshDisplay();
        animateCardReorder(list, previousPositions, movedSongKey);
    }

    /**
     * ドラッグ開始時に移動元の曲キーを覚え、dataTransfer にも保存する。
     * ポインタに付いてくる像は透明にし、元の位置のカードは半透明にする。
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
        hideDragImage(event);
        resetDragState();
        draggedSongKey = songKey;
        card.classList.add("dragging");
    }

    /**
     * ドラッグ終了時に、覚えていた移動元と一時スタイルを解除する。
     * 一覧の中で離さずに終わった（一覧の外で離した、Esc で取り消した）ときは、元の順序へ戻す。
     * @param event ハンドルで終わった dragend のイベント
     */
    function onDragEnd(event: BookmarkDragEvent): void {
        const draggedKey = draggedSongKey;
        const wasPreviewing = draggedKey !== null && previewIndex !== null;
        resetDragState();
        const handle = event.currentTarget;
        const card = isHtmlElement(handle) ? getSongCardFromTarget(handle) : null;
        card?.classList.remove("dragging");
        if (wasPreviewing && draggedKey) restoreSavedOrder(draggedKey);
    }

    /**
     * ポインタの下のカードの位置へ移動元を移して見せ、他のカードをよけさせる。
     * カードの高さが違っても行ったり来たりしないよう、直前によけたカードはポインタがそこから出るまで対象にせず、
     * 並べ替えた直後はポインタが少し動くまで次の並べ替えをしない。
     * @param event ポインタの位置を持つ dragenter または dragover のイベント
     */
    function previewAtPointer(event: BookmarkDragEvent): void {
        const list = getResultList();
        const draggedKey = draggedSongKey;
        if (draggedKey === null || !list) return;
        const point = getPointInList(list, event);
        if (!point) return;
        const card = findCardAtPoint(list, point);
        const songKey = card?.dataset.songKey || "";
        if (songKey !== movedAsideSongKey) movedAsideSongKey = null;
        if (!card || !songKey || songKey === draggedKey || songKey === movedAsideSongKey) return;
        if (lastPreviewPoint && Math.hypot(point.x - lastPreviewPoint.x, point.y - lastPreviewPoint.y) < PREVIEW_POINTER_THRESHOLD_PX) {
            return;
        }
        const targetIndex = getSongCards(list).indexOf(card);
        if (targetIndex === -1) return;
        const previousPositions = captureCardPositions(list);
        previewIndex = targetIndex;
        movedAsideSongKey = songKey;
        lastPreviewPoint = point;
        refreshDisplay();
        animateCardReorder(list, previousPositions, draggedKey);
    }

    /**
     * ブックマーク表示中の一覧では、dragenter と dragover の既定動作を止めてドロップを受け付ける。
     * カードの間の隙間で離しても確定できるよう、カードではなく一覧で受ける。
     * WebKit は dragenter も止めないと、要素の境目を越えた直後に離したドロップを受け付けない。
     * ハンドル以外から始めたドラッグ（タイトルのリンクや外部のファイルなど）も受け止めるが、並べ替えはしない。
     * @param event dragenter または dragover のイベント
     */
    function acceptDragOverResults(event: BookmarkDragEvent): void {
        if (!data.activeBookmark) return;
        event.preventDefault();
        previewAtPointer(event);
    }

    /**
     * 一覧の中で離したときに、見えている順序で並べ替えを確定し、ブックマーク操作 API へ通知する。
     * 並べ替えのドラッグでなければ、ドロップを受け止めるだけで何もしない。
     * @param event 一覧の中で起きた drop のイベント
     */
    function onDrop(event: BookmarkDragEvent): void {
        if (!data.activeBookmark) return;
        event.preventDefault();
        const draggedKey = draggedSongKey;
        const targetIndex = previewIndex;
        resetDragState();
        if (!draggedKey || targetIndex === null) return;
        // 保存されている順序で、見えている位置にある曲を移動先にすると、見えている順序と同じ並べ替えになる。
        const targetKey = data.currentResults[targetIndex]?.songKey || "";
        if (!targetKey || targetKey === draggedKey) return;
        const saveResult = moveSongInActiveBookmark(draggedKey, targetKey);
        if (saveResult.ok === false) {
            onSaveFailure(saveResult);
            restoreSavedOrder(draggedKey);
            return;
        }
        if (!saveResult.changed) restoreSavedOrder(draggedKey);
    }

    /**
     * 並べ替え途中なら、移動元を見せている位置へ移した順序を返す。描画にだけ使い、保存する順序は変えない。
     * @param rows 保存されている順序の曲
     * @returns 表示する順序の曲
     */
    function orderForPreview<Row extends { songKey: string }>(rows: Row[]): Row[] {
        if (draggedSongKey === null || previewIndex === null) return rows;
        const fromIndex = rows.findIndex((row) => row.songKey === draggedSongKey);
        if (fromIndex === -1) return rows;
        const toIndex = Math.min(previewIndex, rows.length - 1);
        if (toIndex === fromIndex) return rows;
        const ordered = rows.slice();
        const [dragged] = ordered.splice(fromIndex, 1);
        ordered.splice(toIndex, 0, dragged);
        return ordered;
    }

    /**
     * 指定した曲が、ハンドルから始めた並べ替えのドラッグの移動元かを返す。
     * ドラッグ中に結果一覧を描き直しても、移動元の表示を保つために使う。
     * @param songKey 調べる曲のキー
     * @returns 移動元なら true
     */
    function isDraggingSong(songKey: string): boolean {
        return draggedSongKey !== null && draggedSongKey === songKey;
    }

    return {
        isDraggingSong,
        orderForPreview,
        onDragStart,
        onDragEnd,
        onDragEnter: acceptDragOverResults,
        onDragOver: acceptDragOverResults,
        onDrop
    };
}
