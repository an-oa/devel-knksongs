/**
 * 日付文字列を `YYYYMMDD` 形式の数値キーへ解析する。
 * @param {string | null | undefined} raw
 * @returns {number | null}
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
 * @param {number} key
 * @returns {{ year: number, month: number, day: number }}
 */
export function dateKeyToParts(key) {
    const year = Math.floor(key / 10000);
    const month = Math.floor((key % 10000) / 100);
    const day = key % 100;
    return { year, month, day };
}

/**
 * 曲データの日付が指定範囲内かどうかを判定する。
 * @param {{ dateKey?: number | null }} row
 * @param {number | null | undefined} fromKey
 * @param {number | null | undefined} toKey
 * @returns {boolean}
 */
export function isWithinDateRange(row, fromKey, toKey) {
    if (!fromKey && !toKey) return true;
    if (!row.dateKey) return false;
    if (fromKey && row.dateKey < fromKey) return false;
    if (toKey && row.dateKey > toKey) return false;
    return true;
}
