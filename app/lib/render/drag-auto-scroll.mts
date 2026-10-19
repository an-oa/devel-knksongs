import { getViewportHeight, getVisibleHeaderBottom } from "../dom-utils.mjs";

/** 見えている範囲の上端（ヘッダーの下端）と下端から、この距離に入ると、ページを自動でスクロールする。 */
const EDGE_ZONE_PX = 48;
/** 端に最も近いときの、1 フレームあたりのスクロール量。 */
const MAX_STEP_PX = 16;

type VisibleEdges = { top: number; bottom: number };

/**
 * ポインタの縦の位置から、1 フレームでページをスクロールする量を返す。
 * 端に近いほど速くし、端を越えた（ヘッダーの上や画面の外）ときは最も速くする。
 * 本番コードでは createDragAutoScroller から使い、端の境界を単体テストするため export している。
 * @param clientY 画面から見たポインタの縦の位置
 * @param edges 見えている範囲の上端と下端
 * @returns 上へは負、下へは正のスクロール量。端の近くでなければ 0
 */
export function getAutoScrollStep(clientY: number, edges: VisibleEdges): number {
    if (!Number.isFinite(clientY) || edges.bottom - edges.top <= EDGE_ZONE_PX * 2) return 0;
    const depthIntoTop = edges.top + EDGE_ZONE_PX - clientY;
    if (depthIntoTop > 0) return -Math.ceil(MAX_STEP_PX * Math.min(1, depthIntoTop / EDGE_ZONE_PX));
    const depthIntoBottom = clientY - (edges.bottom - EDGE_ZONE_PX);
    if (depthIntoBottom > 0) return Math.ceil(MAX_STEP_PX * Math.min(1, depthIntoBottom / EDGE_ZONE_PX));
    return 0;
}

/**
 * 並べ替えのドラッグ中、ポインタが画面の上端や下端の近くにある間、ページをフレームごとに少しずつスクロールする。
 * ポインタのイベントで運ぶと、ブラウザは端でのスクロールをしないので、運びたい先が画面の外にあるときに使う。
 * @param onScroll ページがスクロールしたときに呼ぶ。一覧の中のポインタの位置が変わるので、並べ替えのプレビューをやり直す
 */
export function createDragAutoScroller(onScroll: () => void) {
    /** 端のスクロールを見ている間の、画面から見たポインタの縦の位置。見ていなければ null。 */
    let pointerY: number | null = null;
    /** 予約したアニメーションフレームの id。予約していなければ null。 */
    let frameId: number | null = null;

    /**
     * 今のポインタの位置で、1 フレームにスクロールする量を返す。
     * ヘッダーはスクロールで出たり隠れたりするので、毎回測る。
     * @returns スクロール量。端の近くでないか、見ていなければ 0
     */
    function readStep(): number {
        if (pointerY === null) return 0;
        return getAutoScrollStep(pointerY, { top: getVisibleHeaderBottom(), bottom: getViewportHeight() });
    }

    /**
     * 1 フレーム分スクロールし、ポインタが端の近くにある間は次のフレームも予約する。
     * ページの先頭や末尾で動かなくても、続きのカードを読み込むとまた動けるので、端にいる間は予約を続ける。
     */
    function scrollFrame(): void {
        frameId = null;
        const step = readStep();
        if (step === 0) return;
        const scrollYBefore = window.scrollY;
        window.scrollBy({ top: step, behavior: "instant" });
        if (window.scrollY !== scrollYBefore) onScroll();
        frameId = requestAnimationFrame(scrollFrame);
    }

    /**
     * ポインタの位置を覚え、端の近くに入ったらスクロールを始める。
     * @param clientY 画面から見たポインタの縦の位置
     */
    function follow(clientY: number): void {
        pointerY = clientY;
        if (frameId === null && readStep() !== 0) frameId = requestAnimationFrame(scrollFrame);
    }

    /**
     * ドラッグが終わったので、スクロールをやめ、予約したフレームも取り消す。
     */
    function stop(): void {
        pointerY = null;
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
    }

    return { follow, stop };
}
