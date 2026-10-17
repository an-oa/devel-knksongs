type ResultsViewportRefreshInput = {
    resultList?: HTMLElement | null;
    refreshRecommendedDisplay: () => boolean;
    refreshLayout: () => void;
};

/**
 * viewport や結果一覧のサイズ変更に合わせて、結果表示に関わる再描画をまとめて行う。
 * masonry 配置とおすすめ件数を同じ frame で更新する。
 * おすすめを減らすときに画面内のカードを数えられるよう、先に今の幅で並び直す。
 * @param input 監視する結果一覧と、おすすめ件数・配置の更新処理
 * @returns 監視を解除する関数
 */
export function setupResultsViewportRefresh({
    resultList,
    refreshRecommendedDisplay,
    refreshLayout
}: ResultsViewportRefreshInput): () => void {
    let pendingFrameId: number | null = null;
    let lastObservedWidth: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    /**
     * 現在の viewport に合わせた結果一覧の更新を行う。
     */
    function refreshForCurrentViewport(): void {
        pendingFrameId = null;
        refreshLayout();
        refreshRecommendedDisplay();
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
     * observer と resize listener を解除する。
     */
    function disconnect(): void {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
            window.removeEventListener("resize", scheduleRefresh);
        }
        if (
            pendingFrameId !== null &&
            typeof cancelAnimationFrame === "function"
        ) {
            cancelAnimationFrame(pendingFrameId);
        }
        pendingFrameId = null;
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
    }

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("resize", scheduleRefresh);
    }

    return disconnect;
}
