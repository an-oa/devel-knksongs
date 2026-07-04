type ResultsViewportRefreshInput = {
    resultList?: HTMLElement | null;
    refreshRecommendedDisplay: () => boolean;
    refreshLayout: () => void;
    setupScrollObserver: () => void;
};

/**
 * viewport や結果一覧のサイズ変更に合わせて、結果表示に関わる再描画をまとめて行う。
 * おすすめ件数、masonry 配置、YouTube thumbnail observer を同じ frame で更新する。
 * @param {ResultsViewportRefreshInput} input
 * @returns {() => void}
 */
export function setupResultsViewportRefresh({
    resultList,
    refreshRecommendedDisplay,
    refreshLayout,
    setupScrollObserver
}: ResultsViewportRefreshInput): () => void {
    let pendingFrameId: number | null = null;
    let lastObservedWidth: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    /**
     * 現在の viewport に合わせた結果一覧の更新を行う。
     */
    function refreshForCurrentViewport(): void {
        pendingFrameId = null;
        setupScrollObserver();
        if (!refreshRecommendedDisplay()) {
            refreshLayout();
        }
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
            const nextWidth = getObservedInlineSize(resultListEntry);
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

/**
 * ResizeObserver の entry から resultList の現在幅を取得する。
 * @param {ResizeObserverEntry} entry
 * @returns {number}
 */
function getObservedInlineSize(entry: ResizeObserverEntry): number {
    return entry.contentRect.width;
}
