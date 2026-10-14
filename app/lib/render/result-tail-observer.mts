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
 * IntersectionObserver 非対応のブラウザは対象外とし、代替の監視は持たない。
 * @param input 監視する sentinel の取得と、追加表示の判定・実行
 * @returns 監視の開始と停止を行う controller
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

    /**
     * 検索結果末尾の監視を停止し、sentinel を非表示にする。
     */
    function disconnect(): void {
        if (resultTailObserver) {
            resultTailObserver.disconnect();
            resultTailObserver = null;
        }
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
