import { isGuestStreamRole } from "./stream-role.mjs?v=18";

export const FRAME_SCOPE_ALL = "all";
export const FRAME_SCOPE_OWN = "own";
export const FRAME_SCOPE_GUEST = "guest";
export const DEFAULT_FRAME_SCOPE = FRAME_SCOPE_ALL;

/**
 * 配信での立場フィルタの値を既知の値へ正規化する。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeFrameScope(value) {
    if (value === FRAME_SCOPE_OWN || value === FRAME_SCOPE_GUEST) return value;
    return DEFAULT_FRAME_SCOPE;
}

/**
 * 曲行が指定された配信での立場に一致するか判定する。
 * `ゲスト` 以外はホスト側として扱う。
 * @param {{ streamRole?: string | null } | null | undefined} row
 * @param {unknown} frameScope
 * @returns {boolean}
 */
export function matchesFrameScope(row, frameScope) {
    const normalizedScope = normalizeFrameScope(frameScope);
    if (normalizedScope === FRAME_SCOPE_ALL) return true;
    const isGuest = isGuestStreamRole(row && row.streamRole);
    return normalizedScope === FRAME_SCOPE_GUEST ? isGuest : !isGuest;
}
