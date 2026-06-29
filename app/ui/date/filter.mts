import { dateKeyToParts, parseDateKey } from "../../lib/date-key.mjs";
import { getDateUiState } from "../../lib/ui-slices.mjs";
import type { AppUiElements, DateUiRuntimeState } from "../../state.types";

/**
 * @typedef {"year" | "month" | "day"} DateSelectPrecision
 */

/**
 * @typedef {{
 *   year: number,
 *   month: number | null,
 *   day: number | null,
 *   precision: DateSelectPrecision
 * }} DateSelectValue
 */

type DateSelectPrecision = "year" | "month" | "day";

type DateSelectKind = "from" | "to";

type DateSelectParts = {
    year: string;
    month: string;
    day: string;
};

type DateSelectValue = {
    year: number;
    month: number | null;
    day: number | null;
    precision: DateSelectPrecision;
};

type DateSelectBounds = SearchDateRange;

type DateFilterUiElements = Pick<
    AppUiElements,
    "dateFromYear" |
    "dateFromMonth" |
    "dateFromDay" |
    "dateToYear" |
    "dateToMonth" |
    "dateToDay"
>;

type DateFilterUiState = {
    el: DateFilterUiElements;
    date: DateUiRuntimeState;
};

/**
 * 日付フィルタ UI の初期化・同期・補正を扱うコントローラーを作成する。
 * @param {{ ui: any }} options
 */
export function createDateFilterController({ ui }: { ui: DateFilterUiState }) {
    const dateUi = getDateUiState(ui);

    /**
     * 外部から渡された日付選択側を内部の from/to に正規化する。
     * @param {string} kind
     * @returns {DateSelectKind}
     */
    function resolveDateSelectKind(kind: string): DateSelectKind {
        return kind === "from" ? "from" : "to";
    }

    /**
     * 開始/終了いずれかの日付選択があるか判定する。
     */
    function hasDateSelection(): boolean {
        return hasPartialDateSelection("from") || hasPartialDateSelection("to");
    }

    /**
     * 指定側の日付セレクトに部分入力があるか判定する。
     * @param {DateSelectKind} kind
     */
    function hasPartialDateSelection(kind: DateSelectKind): boolean {
        const parts = getDateSelectParts(kind);
        return parts.year !== "" || parts.month !== "" || parts.day !== "";
    }

    /**
     * 開始または終了側の日付セレクト値を取得する。
     * @param {string} kind
     * @returns {{ year: string, month: string, day: string }}
     */
    function getDateSelectParts(kind: string): DateSelectParts {
        const isFrom = resolveDateSelectKind(kind) === "from";
        const year = (isFrom ? ui.el.dateFromYear : ui.el.dateToYear)?.value ?? "";
        const month = (isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth)?.value ?? "";
        const day = (isFrom ? ui.el.dateFromDay : ui.el.dateToDay)?.value ?? "";
        return { year, month, day };
    }

    /**
     * 日付セレクトの値を精度に応じた文字列で取得する。
     * @param {string} kind
     * @returns {string}
     */
    function getDateSelectValue(kind: string): string {
        return formatDateSelectValue(normalizeDateSelectParts(getDateSelectParts(kind)));
    }

    /**
     * セレクト部品の文字列値を部分日付値へ正規化する。
     * @param {{ year: string, month: string, day: string }} parts
     * @returns {DateSelectValue | null}
     */
    function normalizeDateSelectParts(parts: DateSelectParts): DateSelectValue | null {
        const yearText = parts.year.trim();
        if (!/^\d{4}$/.test(yearText)) return null;
        const year = Number(yearText);
        const monthText = parts.month.trim();
        if (!monthText) return { year, month: null, day: null, precision: "year" };
        if (!/^\d{1,2}$/.test(monthText)) return null;
        const month = Number(monthText);
        if (month < 1 || month > 12) return null;
        const dayText = parts.day.trim();
        if (!dayText) return { year, month, day: null, precision: "month" };
        if (!/^\d{1,2}$/.test(dayText)) return null;
        const day = Number(dayText);
        const key = parseDateKey(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
        if (!key) return null;
        const normalized = dateKeyToParts(key);
        return {
            year: normalized.year,
            month: normalized.month,
            day: normalized.day,
            precision: "day"
        };
    }

    /**
     * 年・年月・年月日の日付文字列を解析する。
     * @param {string | null | undefined} value
     * @returns {DateSelectValue | null}
     */
    function parseDateSelectValue(value: string | null | undefined): DateSelectValue | null {
        if (!value) return null;
        const trimmed = value.trim();
        const match = /^(\d{4})(?:[/-](\d{1,2})(?:[/-](\d{1,2}))?)?$/.exec(trimmed);
        if (!match) return null;
        return normalizeDateSelectParts({
            year: match[1],
            month: match[2] ?? "",
            day: match[3] ?? ""
        });
    }

    /**
     * 部分日付値を保存用の文字列へ整形する。
     * @param {DateSelectValue | null} value
     * @returns {string}
     */
    function formatDateSelectValue(value: DateSelectValue | null): string {
        if (!value) return "";
        const year = String(value.year).padStart(4, "0");
        if (value.precision === "year" || value.month === null) return year;
        const month = String(value.month).padStart(2, "0");
        if (value.precision === "month" || value.day === null) return `${year}-${month}`;
        return `${year}-${month}-${String(value.day).padStart(2, "0")}`;
    }

    /**
     * 部分日付値から検索に使う最小/最大キー範囲を求める。
     * @param {DateSelectValue | null} value
     * @returns {SearchDateRange | null}
     */
    function getDateSelectRange(value: DateSelectValue | null): SearchDateRange | null {
        if (!value) return null;
        const { year, month, day } = value;
        if (value.precision === "year" || month === null) {
            return { minKey: year * 10000 + 101, maxKey: year * 10000 + 1231 };
        }
        const daysInMonth = new Date(year, month, 0).getDate();
        if (value.precision === "month" || day === null) {
            return { minKey: year * 10000 + month * 100 + 1, maxKey: year * 10000 + month * 100 + daysInMonth };
        }
        const key = year * 10000 + month * 100 + day;
        return { minKey: key, maxKey: key };
    }

    /**
     * 完全年月日の部分日付値から日付キーを返す。
     * @param {DateSelectValue | null} value
     * @returns {number | null}
     */
    function getCompleteDateSelectKey(value: DateSelectValue | null): number | null {
        if (!value || value.precision !== "day" || value.month === null || value.day === null) return null;
        return value.year * 10000 + value.month * 100 + value.day;
    }

    /**
     * 日付文字列をセレクト UI へ反映する。
     * @param {string} kind
     * @param {string | null | undefined} value
     */
    function applyDateSelectValue(kind: string, value: string | null | undefined): void {
        const dateValue = parseDateSelectValue(value);
        if (!dateValue) return;
        const dateSelectKind = resolveDateSelectKind(kind);
        const isFrom = dateSelectKind === "from";
        const yearSelect = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
        const monthSelect = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
        const daySelect = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
        if (!yearSelect || !monthSelect || !daySelect) return;
        yearSelect.value = String(dateValue.year);
        monthSelect.value = "";
        daySelect.value = "";
        syncDateSelectOptions(dateSelectKind);
        if (dateValue.precision === "year" || dateValue.month === null) return;
        monthSelect.value = String(dateValue.month).padStart(2, "0");
        daySelect.value = "";
        syncDateSelectOptions(dateSelectKind);
        if (dateValue.precision === "month" || dateValue.day === null) return;
        daySelect.value = String(dateValue.day).padStart(2, "0");
        syncDateSelectOptions(dateSelectKind);
    }

    /**
     * 日付セレクトを全クリアして選択肢を同期する。
     */
    function resetDateSelects(): void {
        (["from", "to"] as const).forEach((kind) => {
            const isFrom = kind === "from";
            const year = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
            const month = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
            const day = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
            if (year) year.value = "";
            if (month) month.value = "";
            if (day) day.value = "";
        });
        syncDateSelectOptions();
    }

    /**
     * 部分指定を含む日付入力から最小/最大キー範囲を求める。
     * @param {string} kind
     * @returns {SearchDateRange | null}
     */
    function getPartialDateRange(kind: string): SearchDateRange | null {
        return getDateSelectRange(normalizeDateSelectParts(getDateSelectParts(kind)));
    }

    /**
     * 反対側入力を考慮した選択可能日付範囲を計算する。
     * @param {DateSelectKind} kind
     * @returns {SearchDateRange | null}
     */
    function getConstrainedBounds(kind: DateSelectKind): SearchDateRange | null {
        if (!dateUi.bounds) return null;
        let minKey = dateUi.bounds.minKey;
        let maxKey = dateUi.bounds.maxKey;
        const otherKind = kind === "from" ? "to" : "from";
        const otherRange = getPartialDateRange(otherKind);
        if (otherRange) {
            if (kind === "to") {
                minKey = Math.max(minKey, otherRange.minKey);
            } else {
                maxKey = Math.min(maxKey, otherRange.maxKey);
            }
        }
        if (minKey > maxKey) {
            if (kind === "to") minKey = maxKey;
            else maxKey = minKey;
        }
        return { minKey, maxKey };
    }

    /**
     * 日付境界に基づいて年/月/日セレクトを初期化する。
     * @param {SearchDateRange} bounds
     */
    function initDateSelects(bounds: SearchDateRange): void {
        const { minKey, maxKey } = bounds;
        const minParts = dateKeyToParts(minKey);
        const maxParts = dateKeyToParts(maxKey);
        const years = [];
        for (let y = minParts.year; y <= maxParts.year; y++) {
            years.push(String(y));
        }
        buildSelectOptions(ui.el.dateFromYear, years, "年");
        buildSelectOptions(ui.el.dateToYear, years, "年");
        buildSelectOptions(ui.el.dateFromMonth, [], "月");
        buildSelectOptions(ui.el.dateToMonth, [], "月");
        buildSelectOptions(ui.el.dateFromDay, [], "日");
        buildSelectOptions(ui.el.dateToDay, [], "日");
        syncDateSelectOptions();
        applyPendingDateValues();
    }

    /**
     * 年/月ごとの利用可能日を引ける日付インデックスを作る。
     * @param {Song[]} songs
     * @returns {Map<string, number[]>}
     */
    function buildDateIndex(songs: Song[]): Map<string, number[]> {
        const index = new Map<string, Set<number>>();
        for (const row of songs) {
            if (!row.dateKey) continue;
            const { year, month, day } = dateKeyToParts(row.dateKey);
            const key = `${year}-${String(month).padStart(2, "0")}`;
            if (!index.has(key)) index.set(key, new Set());
            index.get(key).add(day);
        }
        const normalized = new Map<string, number[]>();
        for (const [key, set] of index.entries()) {
            normalized.set(key, Array.from(set).sort((a, b) => a - b));
        }
        return normalized;
    }

    /**
     * 指定した年/月で選択可能な日一覧を返す。
     * @param {string} year
     * @param {string} month
     * @returns {number[]}
     */
    function getAvailableDays(year: string, month: string): number[] {
        if (!dateUi.index) return [];
        const key = `${year}-${month}`;
        return dateUi.index.get(key) || [];
    }

    /**
     * セレクト要素の選択肢を再構築する。
     * @param {HTMLSelectElement | null | undefined} select
     * @param {string[]} values
     * @param {string} placeholder
     */
    function buildSelectOptions(
        select: HTMLSelectElement | null | undefined,
        values: string[],
        placeholder: string
    ): void {
        if (!select) return;
        const current = select.value;
        const fragment = document.createDocumentFragment();
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = placeholder;
        fragment.appendChild(empty);
        values.forEach((val) => {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = val;
            fragment.appendChild(opt);
        });
        select.replaceChildren(fragment);
        if (values.includes(current)) {
            select.value = current;
        } else {
            select.value = "";
        }
    }

    /**
     * 現在の境界と選択値に合わせて日付セレクト候補を同期する。
     * @param {string | undefined} kind
     */
    function syncDateSelectOptions(kind?: string): void {
        if (!dateUi.bounds) return;
        const targets = kind ? [resolveDateSelectKind(kind)] : (["from", "to"] as const);
        targets.forEach((k) => {
            const bounds = getConstrainedBounds(k) || dateUi.bounds;
            const isFrom = k === "from";
            const yearSelect = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
            const monthSelect = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
            const daySelect = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
            if (!yearSelect || !monthSelect || !daySelect) return;
            const minParts = dateKeyToParts(bounds.minKey);
            const maxParts = dateKeyToParts(bounds.maxKey);
            const years = buildNumberRange(minParts.year, maxParts.year).map((y) => String(y));
            buildSelectOptions(yearSelect, years, "年");
            const selectedYear = yearSelect.value;
            const minMonth = selectedYear === String(minParts.year) ? minParts.month : 1;
            const maxMonth = selectedYear === String(maxParts.year) ? maxParts.month : 12;
            const months = selectedYear ? buildNumberRange(minMonth, maxMonth).map((m) => String(m).padStart(2, "0")) : [];
            buildSelectOptions(monthSelect, months, "月");
            const monthVal = monthSelect.value;
            if (!selectedYear || !monthVal) {
                buildSelectOptions(daySelect, [], "日");
                return;
            }
            const monthNum = Number(monthVal);
            const availableDays = getAvailableDays(selectedYear, monthVal);
            if (availableDays.length === 0) {
                buildSelectOptions(daySelect, [], "日");
                return;
            }
            let minDay = availableDays[0];
            let maxDay = availableDays[availableDays.length - 1];
            if (selectedYear === String(minParts.year) && monthNum === minParts.month) minDay = Math.max(minDay, minParts.day);
            if (selectedYear === String(maxParts.year) && monthNum === maxParts.month) maxDay = Math.min(maxDay, maxParts.day);
            const days = availableDays
                .filter((d) => d >= minDay && d <= maxDay)
                .map((d) => String(d).padStart(2, "0"));
            buildSelectOptions(daySelect, days, "日");
        });
    }

    /**
     * 保留していた日付復元値をセレクトへ適用する。
     */
    function applyPendingDateValues(): void {
        if (!dateUi.pendingValues) return;
        const { from, to } = dateUi.pendingValues;
        if (from) applyDateSelectValue("from", from);
        if (to) applyDateSelectValue("to", to);
        dateUi.pendingValues = null;
    }

    /**
     * 開始値から終了値までの連番配列を生成する。
     * @param {number} start
     * @param {number} end
     * @returns {number[]}
     */
    function buildNumberRange(start: number, end: number): number[] {
        const list = [];
        for (let i = start; i <= end; i++) list.push(i);
        return list;
    }

    /**
     * 日付キーを `YYYY-MM-DD` 形式へ整形する。
     * @param {number} key
     * @returns {string}
     */
    function formatDateKeyForInput(key: number): string {
        const year = Math.floor(key / 10000);
        const month = Math.floor((key % 10000) / 100);
        const day = key % 100;
        const mm = String(month).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${year}-${mm}-${dd}`;
    }

    /**
     * 曲一覧から日付境界を計算し、日付 UI へ反映する。
     * @param {Song[]} songs
     * @returns {SearchDateRange | null}
     */
    function applyDateInputRange(songs: Song[]): SearchDateRange | null {
        const dateFromYear = ui.el.dateFromYear;
        const dateFromMonth = ui.el.dateFromMonth;
        const dateFromDay = ui.el.dateFromDay;
        const dateToYear = ui.el.dateToYear;
        const dateToMonth = ui.el.dateToMonth;
        const dateToDay = ui.el.dateToDay;
        if (!dateFromYear || !dateFromMonth || !dateFromDay || !dateToYear || !dateToMonth || !dateToDay) return null;
        let minKey: number | null = null;
        let maxKey: number | null = null;
        for (const row of songs) {
            if (!row.dateKey) continue;
            if (minKey === null || row.dateKey < minKey) minKey = row.dateKey;
            if (maxKey === null || row.dateKey > maxKey) maxKey = row.dateKey;
        }
        if (minKey === null || maxKey === null) return null;
        const bounds = { minKey, maxKey };
        dateUi.bounds = bounds;
        dateUi.index = buildDateIndex(songs);
        initDateSelects(bounds);
        return bounds;
    }

    /**
     * 日付入力を許容範囲内に収め、完全日付同士の前後関係を補正する。
     * @param {number} minKey
     * @param {number} maxKey
     */
    function clampDateInputsToBounds(minKey: number, maxKey: number): void {
        const dateFromYear = ui.el.dateFromYear;
        const dateFromMonth = ui.el.dateFromMonth;
        const dateFromDay = ui.el.dateFromDay;
        const dateToYear = ui.el.dateToYear;
        const dateToMonth = ui.el.dateToMonth;
        const dateToDay = ui.el.dateToDay;
        if (!dateFromYear || !dateFromMonth || !dateFromDay || !dateToYear || !dateToMonth || !dateToDay) return;
        const clampKey = (key: number | null): number | null => {
            if (key === null) return null;
            if (key < minKey) return minKey;
            if (key > maxKey) return maxKey;
            return key;
        };
        const currentFromValue = normalizeDateSelectParts(getDateSelectParts("from"));
        const currentToValue = normalizeDateSelectParts(getDateSelectParts("to"));
        const currentFromKey = getCompleteDateSelectKey(currentFromValue);
        const currentToKey = getCompleteDateSelectKey(currentToValue);
        let fromKey = clampKey(currentFromKey);
        let toKey = clampKey(currentToKey);
        if (fromKey !== null && toKey !== null && fromKey > toKey) {
            toKey = fromKey;
        }
        if (fromKey !== null && fromKey !== currentFromKey) applyDateSelectValue("from", formatDateKeyForInput(fromKey));
        if (toKey !== null && toKey !== currentToKey) applyDateSelectValue("to", formatDateKeyForInput(toKey));
    }

    /**
     * 日付境界がある場合に入力値の範囲補正を行う。
     */
    function clampDateInputsIfNeeded(): void {
        if (!dateUi.bounds) return;
        clampDateInputsToBounds(dateUi.bounds.minKey, dateUi.bounds.maxKey);
    }

    return {
        hasDateSelection,
        getDateSelectValue,
        applyDateSelectValue,
        resetDateSelects,
        getPartialDateRange,
        syncDateSelectOptions,
        applyPendingDateValues,
        applyDateInputRange,
        clampDateInputsToBounds,
        clampDateInputsIfNeeded
    };
}
