import { isGuestStreamRole } from "./stream-role.mjs?v=18";

/**
 * 検索比較しやすい形に文字列を正規化する。
 * @param {*} s
 */
export function normalizeForSearch(s) {
    return (s || "")
        .normalize("NFKC")
        .replace(/[\u3041-\u3096\u309D-\u309F]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60))
        .toLowerCase();
}

/**
 * 日付文字列を `YYYYMMDD` 形式の数値キーへ解析する。
 * @param {*} raw
 */
export function parseDateKey(raw) {
    if (!raw) return null;
    const trimmed = raw.trim();
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(trimmed);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return year * 10000 + month * 100 + day;
}

/**
 * 日付キーを年・月・日に分解する。
 * @param {*} key
 */
export function dateKeyToParts(key) {
    const year = Math.floor(key / 10000);
    const month = Math.floor((key % 10000) / 100);
    const day = key % 100;
    return { year, month, day };
}

/**
 * 曲データの日付が指定範囲内かどうかを判定する。
 * @param {*} row
 * @param {*} fromKey
 * @param {*} toKey
 */
export function isWithinDateRange(row, fromKey, toKey) {
    if (!fromKey && !toKey) return true;
    if (!row.dateKey) return false;
    if (fromKey && row.dateKey < fromKey) return false;
    if (toKey && row.dateKey > toKey) return false;
    return true;
}

export const FRAME_SCOPE_ALL = "all";
export const FRAME_SCOPE_OWN = "own";
export const FRAME_SCOPE_GUEST = "guest";
export const DEFAULT_FRAME_SCOPE = FRAME_SCOPE_ALL;

/**
 * 配信での立場フィルタの値を既知の値へ正規化する。
 * @param {*} value
 */
export function normalizeFrameScope(value) {
    if (value === FRAME_SCOPE_OWN || value === FRAME_SCOPE_GUEST) return value;
    return DEFAULT_FRAME_SCOPE;
}

/**
 * 曲行が指定された配信での立場に一致するか判定する。
 * `ゲスト` 以外はホスト側として扱う。
 * @param {*} row
 * @param {*} frameScope
 */
export function matchesFrameScope(row, frameScope) {
    const normalizedScope = normalizeFrameScope(frameScope);
    if (normalizedScope === FRAME_SCOPE_ALL) return true;
    const isGuest = isGuestStreamRole(row && row.streamRole);
    return normalizedScope === FRAME_SCOPE_GUEST ? isGuest : !isGuest;
}

/**
 * クエリ・日付・形式・フラグ条件で曲一覧を絞り込む。
 * @param {*} rows
 * @param {*} searchState
 * @param {*} selectedFormats
 */
export function filterSongsByCriteria(rows, searchState, selectedFormats) {
    const queryNorm = normalizeForSearch(searchState.queryRaw);
    const keywords = queryNorm.split(/[\s\u3000]+/).filter((k) => k.length > 0);
    return rows.filter((row) => {
        const matchText = keywords.every((kw) =>
            row.titleNorm.includes(kw) ||
            row.artistNorm.includes(kw) ||
            row.titleYomiNorm.includes(kw) ||
            row.artistYomiNorm.includes(kw)
        );
        const matchDate = isWithinDateRange(row, searchState.dateFromKey, searchState.dateToKey);
        return matchText &&
            matchDate &&
            matchesSelectedFormat(row.format, selectedFormats) &&
            matchesFrameScope(row, searchState.frameScope) &&
            (!searchState.relayOnly || row.isRelay) &&
            (!searchState.harmonyOnly || row.isHarmony);
    });
}

/**
 * 形式が「歌みた」かどうかを判定する。
 * @param {*} format
 */
function isUtamitaFormat(format) {
    return format === "歌みた";
}

/**
 * 形式が「オリ曲」かどうかを判定する。
 * @param {*} format
 */
export function isOriginalSongFormat(format) {
    return format === "オリ曲";
}

/**
 * 形式が「歌みた」系かどうかを判定する。
 * 「オリ曲」は「歌みた」と同等に扱う。
 * @param {*} format
 */
export function isUtamitaEquivalentFormat(format) {
    return isUtamitaFormat(format) || isOriginalSongFormat(format);
}

/**
 * 形式が「配信」かどうかを判定する。
 * @param {*} format
 */
export function isStreamFormat(format) {
    return format === "配信";
}

/**
 * 形式が「ショート」かどうかを判定する。
 * @param {*} format
 */
export function isShortFormat(format) {
    return format === "ショート";
}

/**
 * 指定フォーマットが現在の選択状態に含まれるかを判定する。
 * 「オリ曲」は「歌みた」と同じ選択肢で通す。
 * @param {*} format
 * @param {*} selectedFormats
 */
function matchesSelectedFormat(format, selectedFormats) {
    if (selectedFormats.has(format)) return true;
    if (!isUtamitaEquivalentFormat(format)) return false;
    return selectedFormats.has("歌みた") || selectedFormats.has("オリ曲");
}
