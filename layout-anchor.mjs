/**
 * 指定要素を含む最も近いスクロール可能祖先を返す。
 * @param {*} element
 */
export function findScrollableAncestor(element) {
    let current = element ? element.parentElement : null;
    while (current) {
        const style = window.getComputedStyle(current);
        const overflowY = style ? style.overflowY : "";
        const isScrollable = (overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight;
        if (isScrollable) return current;
        current = current.parentElement;
    }
    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

/**
 * レイアウト更新後に元の見えていた位置へ戻すためのアンカー情報を作る。
 * @param {*} element
 */
export function createViewportAnchor(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return null;
    return {
        element,
        container: findScrollableAncestor(element),
        top: element.getBoundingClientRect().top
    };
}

/**
 * アンカー要素の見えていた位置を維持するようスクロール位置を補正する。
 * @param {*} anchor
 */
export function restoreViewportAnchor(anchor) {
    if (!anchor || !(anchor.element instanceof HTMLElement) || !anchor.element.isConnected) return;
    const nextTop = anchor.element.getBoundingClientRect().top;
    const delta = nextTop - anchor.top;
    if (Math.abs(delta) < 1) return;
    const container = anchor.container;
    if (container === document.body || container === document.documentElement || container === document.scrollingElement) {
        window.scrollBy({ top: delta, behavior: "auto" });
        return;
    }
    container.scrollTop += delta;
}

/**
 * スクロール位置を維持しながらレイアウト再計算するスケジューラーを作る。
 * 最新リクエストだけが有効になる。
 * @param {*} getRefreshLayout
 */
export function createLayoutRefreshScheduler(getRefreshLayout) {
    let generation = 0;
    return function scheduleLayoutRefresh(anchorElement) {
        const requestGeneration = ++generation;
        const anchor = createViewportAnchor(anchorElement);
        requestAnimationFrame(() => {
            if (requestGeneration !== generation) return;
            const refreshLayout = typeof getRefreshLayout === "function" ? getRefreshLayout() : null;
            if (typeof refreshLayout === "function") {
                refreshLayout();
            }
            restoreViewportAnchor(anchor);
            requestAnimationFrame(() => {
                if (requestGeneration !== generation) return;
                restoreViewportAnchor(anchor);
            });
        });
    };
}
