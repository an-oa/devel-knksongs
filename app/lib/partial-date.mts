import { dateKeyToParts, parseDateKey } from "./date-key.mjs";

export type PartialDatePrecision = "year" | "month" | "day";

export type PartialDatePartsInput = {
    year: string;
    month?: string | null;
    day?: string | null;
};

export type PartialDateValue = {
    year: number;
    month: number | null;
    day: number | null;
    precision: PartialDatePrecision;
};

export type PartialDateKeyRange = {
    minKey: number;
    maxKey: number;
};

/**
 * 年がグレゴリオ暦のうるう年か判定する。
 * @param {number} year
 */
function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * 指定した年と月の日数を返す。
 * @param {number} year
 * @param {number} month
 */
function getDaysInMonth(year: number, month: number): number {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
    return 31;
}

/**
 * 年・月・日の文字列を、指定精度を保持する部分日付値へ正規化する。
 * @param {PartialDatePartsInput} parts
 * @returns {PartialDateValue | null}
 */
export function normalizePartialDateParts(parts: PartialDatePartsInput): PartialDateValue | null {
    const yearText = parts.year.trim();
    if (!/^\d{4}$/.test(yearText)) return null;
    const yearKey = parseDateKey(`${yearText}-01-01`);
    if (yearKey === null) return null;
    const year = dateKeyToParts(yearKey).year;
    const monthText = (parts.month ?? "").trim();
    if (!monthText) return { year, month: null, day: null, precision: "year" };
    if (!/^\d{1,2}$/.test(monthText)) return null;
    const month = Number(monthText);
    if (month < 1 || month > 12) return null;
    const dayText = (parts.day ?? "").trim();
    if (!dayText) return { year, month, day: null, precision: "month" };
    if (!/^\d{1,2}$/.test(dayText)) return null;
    const key = parseDateKey(`${yearText}-${monthText}-${dayText}`);
    if (key === null) return null;
    const normalized = dateKeyToParts(key);
    return {
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        precision: "day"
    };
}

/**
 * 部分日付値を、検索で利用する包含境界の最小・最大日付キーへ変換する。
 * @param {PartialDateValue | null | undefined} value
 * @returns {PartialDateKeyRange | null}
 */
export function getPartialDateKeyRange(
    value: PartialDateValue | null | undefined
): PartialDateKeyRange | null {
    if (!value) return null;
    const { year, month, day } = value;
    if (value.precision === "year" || month === null) {
        return { minKey: year * 10000 + 101, maxKey: year * 10000 + 1231 };
    }
    if (value.precision === "month" || day === null) {
        const daysInMonth = getDaysInMonth(year, month);
        return {
            minKey: year * 10000 + month * 100 + 1,
            maxKey: year * 10000 + month * 100 + daysInMonth
        };
    }
    const key = year * 10000 + month * 100 + day;
    return { minKey: key, maxKey: key };
}
