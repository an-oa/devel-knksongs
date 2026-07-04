/**
 * 現在の実行環境で HTMLElement 判定が可能な場合だけ要素型チェックする。
 * @param {*} value
 * @returns {value is HTMLElement}
 */
export function isHtmlElement(value: unknown): value is HTMLElement {
    return typeof HTMLElement === "function" && value instanceof HTMLElement;
}

/**
 * 要素生成に必要な document API が利用可能か判定する。
 * @returns {boolean}
 */
export function canUseDom(): boolean {
    return typeof document === "object" && !!document && typeof document.createElement === "function";
}

/**
 * 現在の viewport 高を返す。
 * @returns {number}
 */
export function getViewportHeight(): number {
    if (typeof window !== "undefined" && Number.isFinite(window.innerHeight)) {
        return window.innerHeight;
    }
    if (typeof document !== "undefined" && Number.isFinite(document.documentElement.clientHeight)) {
        return document.documentElement.clientHeight;
    }
    return 0;
}

/**
 * 固定ヘッダーの高さを返す。
 * @returns {number}
 */
export function getHeaderHeight(): number {
    const header = document.querySelector(".header");
    return header ? header.getBoundingClientRect().height : 0;
}
