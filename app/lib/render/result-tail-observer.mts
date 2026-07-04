import { createResultTailFallbackObserver } from "./result-tail-fallback.mjs";

const DEFAULT_RESULT_TAIL_PREFETCH_MARGIN_PX = 480;

type ResultTailObserverInput = {
    getSentinel: () => HTMLElement | null | undefined;
    hasMoreResults: () => boolean;
    extendDisplayedResults: () => boolean;
    prefetchMarginPx?: number;
};

type ResultTailObserverController = {
    observe: () => void;
    disconnect: () => void;
};

/**
 * 検索結果末尾の sentinel を監視し、下端付近で次の batch を追加表示する controller を作る。
 * IntersectionObserver 非対応環境では scroll/resize 監視へ切り替える。
 * @param {ResultTailObserverInput} input
 * @returns {ResultTailObserverController}
 */
export function createResultTailObserver({
    getSentinel,
    hasMoreResults,
    extendDisplayedResults,
    prefetchMarginPx = DEFAULT_RESULT_TAIL_PREFETCH_MARGIN_PX
}: ResultTailObserverInput): ResultTailObserverController {
    let resultTailObserver: IntersectionObserver | null = null;
    const marginPx = Number.isFinite(prefetchMarginPx) && prefetchMarginPx >= 0
        ? prefetchMarginPx
        : DEFAULT_RESULT_TAIL_PREFETCH_MARGIN_PX;
    const resultTailFallbackObserver = createResultTailFallbackObserver({
        getSentinel,
        hasMoreResults,
        extendDisplayedResults,
        prefetchMarginPx: marginPx
    });

    /**
     * 検索結果末尾の監視を停止し、sentinel を非表示にする。
     */
    function disconnect(): void {
        if (resultTailObserver) {
            resultTailObserver.disconnect();
            resultTailObserver = null;
        }
        resultTailFallbackObserver.disconnect();
        const sentinel = getSentinel();
        if (sentinel) sentinel.hidden = true;
    }

    /**
     * 検索結果末尾が見えたときに、次の batch を追加表示する。
     * @param {IntersectionObserverEntry[]} entries
     */
    function handleIntersection(entries: IntersectionObserverEntry[]): void {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        extendDisplayedResults();
    }

    /**
     * 検索結果末尾を監視し、下端付近までスクロールされたら次の batch を表示する。
     */
    function observe(): void {
        disconnect();
        const sentinel = getSentinel();
        if (!sentinel || !hasMoreResults()) return;
        sentinel.hidden = false;
        if (typeof IntersectionObserver !== "function") {
            resultTailFallbackObserver.observe();
            return;
        }
        resultTailObserver = new IntersectionObserver(handleIntersection, {
            rootMargin: `0px 0px ${marginPx}px 0px`,
            threshold: 0
        });
        resultTailObserver.observe(sentinel);
    }

    return {
        observe,
        disconnect
    };
}
