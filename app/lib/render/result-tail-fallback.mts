import { getViewportHeight } from "../dom-utils.mjs";
import { findScrollableAncestor } from "../layout-anchor.mjs";

type ResultTailFallbackScrollTarget = HTMLElement | Window;

type ResultTailFallbackObserverInput = {
    getSentinel: () => HTMLElement | null | undefined;
    hasMoreResults: () => boolean;
    extendDisplayedResults: () => boolean;
    prefetchMarginPx: number;
};

type ResultTailFallbackObserverController = {
    observe: () => void;
    disconnect: () => void;
};

/**
 * IntersectionObserver 非対応時に、scroll/resize で結果末尾の追加表示を監視する。
 * @param {ResultTailFallbackObserverInput} input
 * @returns {ResultTailFallbackObserverController}
 */
export function createResultTailFallbackObserver({
    getSentinel,
    hasMoreResults,
    extendDisplayedResults,
    prefetchMarginPx
}: ResultTailFallbackObserverInput): ResultTailFallbackObserverController {
    let fallbackScrollContainer: HTMLElement | null = null;
    let fallbackScrollTarget: ResultTailFallbackScrollTarget | null = null;

    /**
     * fallback の scroll/resize 監視を解除する。
     */
    function disconnect(): void {
        if (fallbackScrollTarget && typeof fallbackScrollTarget.removeEventListener === "function") {
            fallbackScrollTarget.removeEventListener("scroll", handleFallback);
        }
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
            window.removeEventListener("resize", handleFallback);
        }
        fallbackScrollContainer = null;
        fallbackScrollTarget = null;
    }

    /**
     * fallback の scroll/resize 監視を開始する。
     */
    function observe(): void {
        disconnect();
        const sentinel = getSentinel();
        if (!sentinel || !hasMoreResults()) return;
        fallbackScrollContainer = findScrollableAncestor(sentinel);
        fallbackScrollTarget = getResultTailFallbackScrollTarget(fallbackScrollContainer);
        if (!fallbackScrollTarget || typeof fallbackScrollTarget.addEventListener !== "function") return;
        fallbackScrollTarget.addEventListener("scroll", handleFallback, { passive: true });
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("resize", handleFallback);
        }
        handleFallback();
    }

    /**
     * 末尾付近のスクロールで次の batch を追加表示する。
     */
    function handleFallback(): void {
        const sentinel = getSentinel();
        if (!sentinel || sentinel.hidden || !hasMoreResults()) return;
        if (!isResultTailNearScrollBoundary(sentinel, prefetchMarginPx, fallbackScrollContainer)) return;
        extendDisplayedResults();
    }

    return {
        observe,
        disconnect
    };
}

/**
 * fallback で監視する scroll target を返す。
 * document 自体がスクロール領域の場合は window の scroll event を監視する。
 * 本番コードでは createResultTailFallbackObserver 経由で使い、target 選択を単体テストするため export している。
 * @param {HTMLElement | null} scrollContainer
 * @returns {ResultTailFallbackScrollTarget | null}
 */
export function getResultTailFallbackScrollTarget(
    scrollContainer: HTMLElement | null
): ResultTailFallbackScrollTarget | null {
    if (!scrollContainer) return typeof window !== "undefined" ? window : null;
    if (isDocumentScrollContainer(scrollContainer)) return typeof window !== "undefined" ? window : null;
    return scrollContainer;
}

/**
 * scroll container から見て、検索結果末尾が追加読み込み範囲に入っているかを返す。
 * 本番コードでは createResultTailFallbackObserver 経由で使い、境界条件を単体テストするため export している。
 * @param {HTMLElement} sentinel
 * @param {number} prefetchMarginPx
 * @param {HTMLElement | null} scrollContainer
 * @returns {boolean}
 */
export function isResultTailNearScrollBoundary(
    sentinel: HTMLElement,
    prefetchMarginPx: number,
    scrollContainer: HTMLElement | null
): boolean {
    const rect = sentinel.getBoundingClientRect();
    const boundary = getScrollBoundary(scrollContainer);
    return rect.top <= boundary.bottom + prefetchMarginPx && rect.bottom >= boundary.top;
}

/**
 * 指定要素が document 全体のスクロール領域かどうかを返す。
 * @param {HTMLElement} scrollContainer
 * @returns {boolean}
 */
function isDocumentScrollContainer(scrollContainer: HTMLElement): boolean {
    if (typeof document === "undefined") return false;
    return (
        scrollContainer === document.body ||
        scrollContainer === document.documentElement ||
        scrollContainer === document.scrollingElement
    );
}

/**
 * fallback 判定に使う可視境界を返す。
 * @param {HTMLElement | null} scrollContainer
 * @returns {{ top: number, bottom: number }}
 */
function getScrollBoundary(scrollContainer: HTMLElement | null): { top: number; bottom: number } {
    if (!scrollContainer || isDocumentScrollContainer(scrollContainer)) {
        return {
            top: 0,
            bottom: getViewportHeight()
        };
    }
    const rect = scrollContainer.getBoundingClientRect();
    return {
        top: rect.top,
        bottom: rect.bottom
    };
}
