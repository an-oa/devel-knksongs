/**
 * 現在の実行環境で HTMLElement 判定が可能な場合だけ要素型チェックする。
 * @param {*} value
 * @returns {boolean}
 */
export function isHtmlElement(value) {
    return typeof HTMLElement === "function" && value instanceof HTMLElement;
}

/**
 * 要素生成に必要な document API が利用可能か判定する。
 * @returns {boolean}
 */
export function canUseDom() {
    return typeof document === "object" && !!document && typeof document.createElement === "function";
}

/**
 * 固定ヘッダーの高さを返す。
 * @returns {number}
 */
export function getHeaderHeight() {
    const header = document.querySelector(".header");
    return header ? header.getBoundingClientRect().height : 0;
}
