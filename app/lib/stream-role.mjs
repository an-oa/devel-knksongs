export const STREAM_ROLE_GUEST = "ゲスト";

/**
 * 配信での立場を比較・表示判定に使える文字列へ正規化する。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeStreamRole(value) {
    return String(value || "").trim();
}

/**
 * 配信での立場が設定されているか判定する。
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasStreamRole(value) {
    return normalizeStreamRole(value) !== "";
}

/**
 * 配信での立場がゲスト枠を表すか判定する。
 * @param {unknown} value
 * @returns {boolean}
 */
export function isGuestStreamRole(value) {
    return normalizeStreamRole(value) === STREAM_ROLE_GUEST;
}
