import { createViewportAnchor, restoreViewportAnchor } from "../layout-anchor.mjs";
import type { ViewportAnchor } from "../layout-anchor.mjs";
import { findFirstSongCardNotScrolledPast } from "./masonry-layout.mjs";

type ResultsViewportRefreshInput = {
    resultList?: HTMLElement | null;
    refreshRecommendedDisplay: () => boolean;
    refreshLayout: () => void;
    /** 読んでいた位置へスクロールを合わせた後に呼ぶ。利用者のスクロールと区別するために使う。 */
    onReadingPositionRestored?: () => void;
};

/**
 * viewport や結果一覧のサイズ変更に合わせて、結果表示に関わる再描画をまとめて行う。
 * masonry 配置とおすすめ件数を同じ frame で更新し、並び直しても読んでいたカードを同じ位置に保つ。
 * 先に今の幅で並び直して位置を合わせ、その画面でおすすめを減らすときに残すカードを数える。
 * @param input 監視する結果一覧と、おすすめ件数・配置の更新処理
 * @returns 監視を解除する関数
 */
export function setupResultsViewportRefresh({
    resultList,
    refreshRecommendedDisplay,
    refreshLayout,
    onReadingPositionRestored
}: ResultsViewportRefreshInput): () => void {
    let pendingFrameId: number | null = null;
    let lastObservedWidth: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let pageResizeObserver: ResizeObserver | null = null;
    // リサイズが知らされる時点では、1 列のカードの高さや一覧より上の要素が、ブラウザによってすでに変わっていることがある。
    // そのため読んでいた位置は、スクロールやページの大きさが変わるたびに記録しておき、リサイズ後はその記録に合わせる。
    let readingPosition: ViewportAnchor | null = null;

    /**
     * 現在の viewport に合わせた結果一覧の更新を行う。
     */
    function refreshForCurrentViewport(): void {
        pendingFrameId = null;
        const recordedReadingPosition = readingPosition;
        refreshLayout();
        if (recordedReadingPosition) {
            restoreViewportAnchor(recordedReadingPosition);
            onReadingPositionRestored?.();
        }
        refreshRecommendedDisplay();
        recordReadingPosition();
    }

    /**
     * 画面の上端より上へ過ぎていない最初のカードを、読んでいる位置の目印として記録する。
     * スクロールやページの大きさの変化はブラウザが 1 frame に 1 回まとめて知らせるので、その場で記録する。
     * リサイズが知らされてから並び直すまでは、リサイズ前の記録を残すため記録しない。
     * ページの先頭にいるときは、並び直した後も先頭に留まるよう記録しない。
     */
    function recordReadingPosition(): void {
        if (pendingFrameId !== null) return;
        const anchor = createViewportAnchor(findFirstSongCardNotScrolledPast(resultList));
        readingPosition = anchor && anchor.container.scrollTop > 0 ? anchor : null;
    }

    /**
     * resize/observer の連続発火を 1 frame にまとめて更新を予約する。
     */
    function scheduleRefresh(): void {
        if (pendingFrameId !== null) return;
        if (typeof requestAnimationFrame !== "function") {
            refreshForCurrentViewport();
            return;
        }
        pendingFrameId = -1;
        const frameId = requestAnimationFrame(refreshForCurrentViewport);
        if (pendingFrameId !== null) pendingFrameId = frameId;
    }

    /**
     * observer と resize・scroll listener を解除する。
     */
    function disconnect(): void {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (pageResizeObserver) {
            pageResizeObserver.disconnect();
            pageResizeObserver = null;
        }
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
            window.removeEventListener("resize", scheduleRefresh);
            window.removeEventListener("scroll", recordReadingPosition);
        }
        if (pendingFrameId !== null && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(pendingFrameId);
        }
        pendingFrameId = null;
        readingPosition = null;
    }

    if (resultList && typeof ResizeObserver === "function") {
        lastObservedWidth = resultList.clientWidth || resultList.getBoundingClientRect().width || 0;
        resizeObserver = new ResizeObserver((entries) => {
            const resultListEntry = entries.find((entry) => entry.target === resultList);
            if (!resultListEntry) return;
            const nextWidth = resultListEntry.contentRect.width;
            if (Math.abs(nextWidth - (lastObservedWidth || 0)) < 0.5) return;
            lastObservedWidth = nextWidth;
            scheduleRefresh();
        });
        resizeObserver.observe(resultList);
        // スクロールせずに結果やヘッダーの高さが変わった場合も、読んでいる位置を記録し直す。
        if (typeof document !== "undefined" && document.body) {
            pageResizeObserver = new ResizeObserver(recordReadingPosition);
            pageResizeObserver.observe(document.body);
        }
    }

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("resize", scheduleRefresh);
        window.addEventListener("scroll", recordReadingPosition, { passive: true });
    }

    return disconnect;
}
