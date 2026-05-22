import { isHtmlElement } from "./dom-utils.mjs?v=22";

/**
 * @typedef {{ element: HTMLElement, container: HTMLElement, top: number }} ViewportAnchor
 */

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
    return isHtmlElement(document.scrollingElement) ? document.scrollingElement : document.documentElement;
}

/**
 * レイアウト更新後に元の見えていた位置へ戻すためのアンカー情報を作る。
 * @param {Element | null | undefined} element
 * @returns {ViewportAnchor | null}
 */
function createViewportAnchor(element) {
    if (!isHtmlElement(element) || !element.isConnected) return null;
    return {
        element,
        container: findScrollableAncestor(element),
        top: element.getBoundingClientRect().top
    };
}

/**
 * アンカー要素の見えていた位置を維持するようスクロール位置を補正する。
 * @param {ViewportAnchor | null | undefined} anchor
 * @returns {void}
 */
function restoreViewportAnchor(anchor) {
    if (!anchor || !isHtmlElement(anchor.element) || !anchor.element.isConnected) return;
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
 * 指定回数の animation frame を待ってから処理を実行する。
 * レイアウト待ちの境界条件を単体テストするため export している。
 * @param {number} frameCount
 * @param {Function | undefined} callback
 * @returns {Promise<*>}
 */
export function afterAnimationFrames(frameCount, callback) {
    const remaining = Number.isFinite(frameCount) ? Math.max(0, Math.floor(frameCount)) : 0;
    return new Promise((resolve) => {
        function step(count) {
            if (count <= 0) {
                resolve(typeof callback === "function" ? callback() : undefined);
                return;
            }
            if (typeof requestAnimationFrame !== "function") {
                resolve(undefined);
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
 * レイアウト補正が落ち着くまで2フレーム待ってから処理を実行する。
 * @param {Function | undefined} callback
 * @returns {Promise<*>}
 */
export function afterLayoutSettled(callback) {
    return afterAnimationFrames(2, callback);
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
        return new Promise((resolve) => {
            afterAnimationFrames(1, () => {
                if (requestGeneration !== generation) {
                    resolve(false);
                    return;
                }
                const refreshLayout = typeof getRefreshLayout === "function" ? getRefreshLayout() : null;
                if (typeof refreshLayout === "function") {
                    refreshLayout();
                }
                restoreViewportAnchor(anchor);
                afterAnimationFrames(1, () => {
                    if (requestGeneration !== generation) {
                        resolve(false);
                        return;
                    }
                    restoreViewportAnchor(anchor);
                    resolve(true);
                });
            });
        });
    };
}
