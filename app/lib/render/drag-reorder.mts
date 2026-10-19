import type { StorageActionFailure, StorageActionResult } from "../../controllers/storage.mjs";
import { isHtmlElement } from "../dom-utils.mjs";
import { animateCardReorder, captureCardPositions } from "./card-reorder-animation.mjs";
import { createDragAutoScroller } from "./drag-auto-scroll.mjs";
import { getSongCards } from "./masonry-layout.mjs";

/** 並べ替えた直後は、ポインタがこの距離だけ動くまで次の並べ替えをしない。 */
const PREVIEW_POINTER_THRESHOLD_PX = 8;

type BookmarkDragReorderDataState = {
    activeBookmark: string | null;
    currentResults: ReadonlyArray<{ songKey: string }>;
};

/** ハンドルを押したときの pointerdown のうち、並べ替えに使う部分。 */
type HandlePointerDownEvent = Pick<PointerEvent, "currentTarget" | "pointerId" | "isPrimary" | "button" | "clientX" | "clientY" | "preventDefault">;

/** 結果一覧がキャプチャしたポインタの、動いた・離した・取り消されたイベントのうち、並べ替えに使う部分。 */
type ListPointerEvent = Pick<PointerEvent, "pointerId" | "clientX" | "clientY">;

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
type ClientPoint = { clientX: number; clientY: number };

/**
 * イベント対象から曲カード要素を返す。
 * @param target イベント対象
 * @returns 対象を含む曲カード。カードの中でなければ null
 */
function getSongCardFromTarget(target: unknown): HTMLElement | null {
    if (!isHtmlElement(target)) return null;
    const card = (target as HTMLElement).closest(".song-card");
    return isHtmlElement(card) ? card as HTMLElement : null;
}

/**
 * 一覧から見たポインタの位置を返す。
 * 一覧を基準にするので、ドラッグ中にページがスクロールしても、カードに対する位置の変化として扱える。
 * @param list 結果カードを並べた一覧
 * @param point 画面から見たポインタの位置
 * @returns 一覧の左上からの位置。位置がなければ null
 */
function getPointInList(list: HTMLElement, point: ClientPoint): PointInList | null {
    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return null;
    const rect = list.getBoundingClientRect();
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
}

/**
 * ポインタが一覧の枠の中にあるかを返す。カードの間の隙間も一覧の中に含める。
 * @param list 結果カードを並べた一覧
 * @param point 画面から見たポインタの位置
 * @returns 一覧の中なら true
 */
function isPointerInList(list: HTMLElement, point: ClientPoint): boolean {
    const pointInList = getPointInList(list, point);
    if (!pointInList) return false;
    const rect = list.getBoundingClientRect();
    return pointInList.x >= 0 && pointInList.y >= 0 && pointInList.x < rect.width && pointInList.y < rect.height;
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
 * ブックマーク表示中のカードを、ハンドルを押したまま運んで並べ替えるコントローラーを作成する。
 * マウスもタッチも同じく Pointer Events で扱う。HTML の Drag and Drop は、Android の Firefox がタッチで始められないので使わない。
 * ドラッグ中は、ポインタの下のカードの位置へ移動元を移して見せ、他のカードをよけさせる（プレビュー）。
 * 保存する順序は、一覧の中で離したときに、見えている順序で確定する。一覧の外で離したときや取り消したときは元の順序へ戻す。
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
    /** 並べ替えのドラッグをしているポインタの id。ドラッグの間、結果一覧がこのポインタをキャプチャする。 */
    let dragPointerId: number | null = null;
    /** 並べ替え途中に移動元を見せている位置（表示順の index）。元の位置のままなら null。 */
    let previewIndex: number | null = null;
    /** 直前の並べ替えでよけたカード。ポインタがそのカードから出るまで、次の対象にしない。 */
    let movedAsideSongKey: string | null = null;
    /** 直前に並べ替えたときのポインタの位置。ポインタが動くまで、次の並べ替えをしない。 */
    let lastPreviewPoint: PointInList | null = null;
    /** 直前に受け取った、画面から見たポインタの位置。端の自動スクロールで一覧が動いたときに、プレビューをやり直す。 */
    let lastClientPoint: ClientPoint | null = null;
    const autoScroller = createDragAutoScroller(() => {
        if (lastClientPoint) previewAtPointer(lastClientPoint);
    });

    /**
     * 並べ替えのドラッグの状態を、ドラッグしていない状態へ戻す。
     * 端のスクロールと、ドラッグの間だけ受けていた文書のイベントもやめる。
     */
    function resetDragState(): void {
        draggedSongKey = null;
        dragPointerId = null;
        previewIndex = null;
        movedAsideSongKey = null;
        lastPreviewPoint = null;
        lastClientPoint = null;
        autoScroller.stop();
        document.removeEventListener("keydown", onDocumentKeyDown);
        document.removeEventListener("contextmenu", preventContextMenu);
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
     * ハンドルを押したときに、移動元の曲キーを覚えて並べ替えのドラッグを始める。
     * 結果一覧でポインタをキャプチャし、描き直しで並びが変わっても、動画の上や一覧の外へ出ても、離すまでのイベントを一覧で受ける。
     * 元の位置のカードは半透明にする。文字の選択やフォーカスの移動が始まらないよう、既定の動作は止める。
     * @param event ハンドルで起きた pointerdown のイベント
     */
    function onHandlePointerDown(event: HandlePointerDownEvent): void {
        if (!data.activeBookmark || dragPointerId !== null) return;
        // 2 本目の指や、マウスの右ボタン・中ボタンでは始めない。
        if (!event.isPrimary || event.button !== 0) return;
        const list = getResultList();
        const card = getSongCardFromTarget(event.currentTarget);
        const songKey = card?.dataset.songKey || "";
        if (!list || !card || !songKey) return;
        try {
            list.setPointerCapture(event.pointerId);
        } catch {
            // キャプチャできないと、一覧の外で離したことを受け取れないので、並べ替えを始めない。
            return;
        }
        event.preventDefault();
        draggedSongKey = songKey;
        dragPointerId = event.pointerId;
        lastClientPoint = { clientX: event.clientX, clientY: event.clientY };
        card.classList.add("dragging");
        document.addEventListener("keydown", onDocumentKeyDown);
        document.addEventListener("contextmenu", preventContextMenu);
    }

    /**
     * ポインタの下のカードの位置へ移動元を移して見せ、他のカードをよけさせる。
     * カードの高さが違っても行ったり来たりしないよう、直前によけたカードはポインタがそこから出るまで対象にせず、
     * 並べ替えた直後はポインタが少し動くまで次の並べ替えをしない。
     * @param clientPoint 画面から見たポインタの位置
     */
    function previewAtPointer(clientPoint: ClientPoint): void {
        const list = getResultList();
        const draggedKey = draggedSongKey;
        if (draggedKey === null || !list) return;
        const point = getPointInList(list, clientPoint);
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
     * ドラッグ中のポインタが動いたら、並べ替えのプレビューを更新し、画面の端の近くならページをスクロールする。
     * @param event 結果一覧が受けた pointermove のイベント
     */
    function onListPointerMove(event: ListPointerEvent): void {
        if (event.pointerId !== dragPointerId) return;
        lastClientPoint = { clientX: event.clientX, clientY: event.clientY };
        previewAtPointer(lastClientPoint);
        autoScroller.follow(event.clientY);
    }

    /**
     * ドラッグ中のポインタを離したら、一覧の中なら見えている順序で保存し、一覧の外なら元の順序へ戻す。
     * @param event 結果一覧が受けた pointerup のイベント
     */
    function onListPointerUp(event: ListPointerEvent): void {
        if (event.pointerId !== dragPointerId) return;
        const list = getResultList();
        finishDrag(list !== null && isPointerInList(list, event));
    }

    /**
     * ブラウザがドラッグ中のポインタを取り消したり、キャプチャが外れたりしたら、元の順序へ戻す。
     * 自分で終えたときに外れるキャプチャは、もうドラッグしていないので何もしない。
     * @param event 結果一覧が受けた pointercancel または lostpointercapture のイベント
     */
    function onListPointerCancel(event: ListPointerEvent): void {
        if (event.pointerId !== dragPointerId) return;
        finishDrag(false);
    }

    /**
     * ドラッグ中に Esc を押したら、並べ替えを取り消して元の順序へ戻す。
     * @param event 文書で受けた keydown のイベント
     */
    function onDocumentKeyDown(event: Pick<KeyboardEvent, "key">): void {
        if (event.key === "Escape") finishDrag(false);
    }

    /**
     * ドラッグ中の長押しで、メニューや文字の選択が出ないようにする。
     * Android の Firefox は、長押しの contextmenu を止めないと、ポインタの下の文字を選択する。
     * @param event 文書で受けた contextmenu のイベント
     */
    function preventContextMenu(event: Pick<Event, "preventDefault">): void {
        event.preventDefault();
    }

    /**
     * 並べ替えのドラッグを終え、キャプチャと移動元の半透明を解除する。
     * 保存するときは見えている順序で並べ替えを確定し、ブックマーク操作 API へ通知する。保存しないときは元の順序へ戻す。
     * @param shouldSave 見えている順序で保存するなら true
     */
    function finishDrag(shouldSave: boolean): void {
        const draggedKey = draggedSongKey;
        const pointerId = dragPointerId;
        const targetIndex = previewIndex;
        resetDragState();
        const list = getResultList();
        if (list && pointerId !== null) releasePointer(list, pointerId);
        if (draggedKey === null) return;
        if (list) {
            getSongCards(list).find((card) => card.dataset.songKey === draggedKey)?.classList.remove("dragging");
        }
        if (targetIndex === null) return;
        if (!shouldSave) {
            restoreSavedOrder(draggedKey);
            return;
        }
        // 保存されている順序で、見えている位置にある曲を移動先にすると、見えている順序と同じ並べ替えになる。
        // 移動先が移動元自身なら、元の位置へ戻して見せているので、保存も描き直しもしない。
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
     * 結果一覧のポインタのキャプチャを外す。離したときはブラウザも外すので、既に外れていてもよい。
     * @param list 結果カードを並べた一覧
     * @param pointerId 外すポインタの id
     */
    function releasePointer(list: HTMLElement, pointerId: number): void {
        try {
            list.releasePointerCapture(pointerId);
        } catch {
            // ポインタが既に無くなっていれば、外すキャプチャもない。
        }
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
        onHandlePointerDown,
        onListPointerMove,
        onListPointerUp,
        onListPointerCancel
    };
}
