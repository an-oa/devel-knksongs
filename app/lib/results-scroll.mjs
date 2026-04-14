import { findScrollableAncestor } from "./layout-anchor.mjs?v=10";

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
 * 指定フレーム数ぶん待機してから処理を実行する。
 * @param {number} frameCount
 * @param {Function | undefined} callback
 * @returns {Promise<*>}
 */
function afterAnimationFrames(frameCount, callback) {
    const remaining = Number.isFinite(frameCount) ? Math.max(0, Math.floor(frameCount)) : 0;
    return new Promise((resolve) => {
        function step(count) {
            if (count <= 0) {
                resolve(typeof callback === "function" ? callback() : undefined);
                return;
            }
            requestAnimationFrame(() => {
                step(count - 1);
            });
        }
        step(remaining);
    });
}

/**
 * 指定要素が見える位置まで、必要なときだけスクロールする。
 * @param {*} element
 * @param {{ topOffset?: number, behavior?: "auto" | "smooth" } | undefined} options
 */
export function scrollElementIntoView(element, options) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return;
    const scrollContainer = findScrollableAncestor(element);
    if (!scrollContainer) return;
    const topOffset = Number.isFinite(options && options.topOffset) ? options.topOffset : 0;
    const behavior = options && options.behavior ? options.behavior : "auto";
    const elementRect = element.getBoundingClientRect();

    if (scrollContainer === document.body || scrollContainer === document.documentElement) {
        const viewTop = topOffset;
        const viewBottom = window.innerHeight || document.documentElement.clientHeight || 0;
        if (elementRect.top >= viewTop && elementRect.bottom <= viewBottom) return;
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
    if (elementRect.top >= viewTop && elementRect.bottom <= viewBottom) return;
    const currentTop = Number.isFinite(scrollContainer.scrollTop) ? scrollContainer.scrollTop : 0;
    const nextTop = Math.max(0, currentTop + (elementRect.top - containerRect.top) - topOffset);
    scrollContainer.scrollTo({ top: nextTop, behavior });
}

/**
 * レイアウト補正が落ち着いた後に、指定要素が見える位置までスクロールする。
 * @param {*} element
 * @param {{ topOffset?: number, behavior?: "auto" | "smooth" } | undefined} options
 * @returns {Promise<*>}
 */
export function scheduleScrollElementIntoView(element, options) {
    return afterAnimationFrames(2, () => {
        scrollElementIntoView(element, options);
    });
}
