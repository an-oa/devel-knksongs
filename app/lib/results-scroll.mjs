import { isHtmlElement } from "./dom-utils.mjs?v=17";
import { afterLayoutSettled, findScrollableAncestor } from "./layout-anchor.mjs?v=17";

/**
 * 結果リストを含むスクロール領域を先頭へ戻す。
 * @param {*} resultList
 */
export function scrollResultListToTop(resultList) {
    if (!resultList) return;
    const scrollContainer = findScrollableAncestor(resultList);
    if (!scrollContainer) return;

    if (scrollContainer === document.body || scrollContainer === document.documentElement) {
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
    }
    scrollContainer.scrollTo({ top: 0, behavior: "auto" });
}

/**
 * 指定要素が見える位置まで、必要時または強制指定時にスクロールする。
 * @param {*} element
 * @param {{ topOffset?: number, behavior?: "auto" | "smooth", force?: boolean } | undefined} options
 */
export function scrollElementIntoView(element, options) {
    if (!isHtmlElement(element) || !element.isConnected) return;
    const scrollContainer = findScrollableAncestor(element);
    if (!scrollContainer) return;
    const topOffset = Number.isFinite(options && options.topOffset) ? options.topOffset : 0;
    const behavior = options && options.behavior ? options.behavior : "auto";
    const force = Boolean(options && options.force);
    const elementRect = element.getBoundingClientRect();

    if (scrollContainer === document.body || scrollContainer === document.documentElement) {
        const viewTop = topOffset;
        const viewBottom = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!force && elementRect.top >= viewTop && elementRect.bottom <= viewBottom) return;
        const currentTop = Number.isFinite(document.scrollingElement && document.scrollingElement.scrollTop)
            ? document.scrollingElement.scrollTop
            : 0;
        const nextTop = Math.max(0, currentTop + elementRect.top - topOffset);
        window.scrollTo({ top: nextTop, behavior });
        return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const viewTop = containerRect.top + topOffset;
    const viewBottom = containerRect.bottom;
    if (!force && elementRect.top >= viewTop && elementRect.bottom <= viewBottom) return;
    const currentTop = Number.isFinite(scrollContainer.scrollTop) ? scrollContainer.scrollTop : 0;
    const nextTop = Math.max(0, currentTop + (elementRect.top - containerRect.top) - topOffset);
    scrollContainer.scrollTo({ top: nextTop, behavior });
}

/**
 * レイアウト補正が落ち着いた後に、指定要素が見える位置までスクロールする。
 * @param {*} element
 * @param {{ topOffset?: number, behavior?: "auto" | "smooth", force?: boolean } | undefined} options
 * @returns {Promise<*>}
 */
export function scheduleScrollElementIntoView(element, options) {
    return afterLayoutSettled(() => {
        scrollElementIntoView(element, options);
    });
}
