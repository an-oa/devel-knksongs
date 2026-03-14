import { findScrollableAncestor } from "./layout-anchor.mjs?v=1";

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
