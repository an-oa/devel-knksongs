import { dateKeyToParts, parseDateKey } from "../../lib/date-key.mjs?v=21";
import { getDateUiState } from "../../lib/ui-slices.mjs?v=21";

/**
 * 日付フィルタ UI の初期化・同期・補正を扱うコントローラーを作成する。
 * @param {{ ui: any }} options
 */
export function createDateFilterController({ ui }) {
    const dateUi = getDateUiState(ui);
    /**
     * 開始/終了いずれかの日付選択があるか判定する。
     */
    function hasDateSelection() {
        return hasPartialDateSelection("from") || hasPartialDateSelection("to");
    }

    /**
     * 指定側の日付セレクトに部分入力があるか判定する。
     * @param {*} kind
     */
    function hasPartialDateSelection(kind) {
        const parts = getDateSelectParts(kind);
        return parts.year !== "" || parts.month !== "" || parts.day !== "";
    }

    /**
     * 開始または終了側の日付セレクト値を取得する。
     * @param {*} kind
     */
    function getDateSelectParts(kind) {
        const isFrom = kind === "from";
        const year = (isFrom ? ui.el.dateFromYear : ui.el.dateToYear)?.value ?? "";
        const month = (isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth)?.value ?? "";
        const day = (isFrom ? ui.el.dateFromDay : ui.el.dateToDay)?.value ?? "";
        return { year, month, day };
    }

    /**
     * 日付セレクトの値を `YYYY-MM-DD` 文字列で取得する。
     * @param {*} kind
     */
    function getDateSelectValue(kind) {
        const { year, month, day } = getDateSelectParts(kind);
        if (!year || !month || !day) return "";
        return `${year}-${month}-${day}`;
    }

    /**
     * 日付文字列をセレクト UI へ反映する。
     * @param {*} kind
     * @param {*} value
     */
    function applyDateSelectValue(kind, value) {
        if (!value) return;
        const key = parseDateKey(value);
        if (!key) return;
        const { year, month, day } = dateKeyToParts(key);
        const isFrom = kind === "from";
        const yearSelect = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
        const monthSelect = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
        const daySelect = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
        if (!yearSelect || !monthSelect || !daySelect) return;
        yearSelect.value = String(year);
        syncDateSelectOptions(kind);
        monthSelect.value = String(month).padStart(2, "0");
        syncDateSelectOptions(kind);
        daySelect.value = String(day).padStart(2, "0");
    }

    /**
     * 日付セレクトを全クリアして選択肢を同期する。
     */
    function resetDateSelects() {
        ["from", "to"].forEach((kind) => {
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
     * @param {*} kind
     */
    function getPartialDateRange(kind) {
        const { year, month, day } = getDateSelectParts(kind);
        if (!year) return null;
        const y = Number(year);
        if (!month) {
            return { minKey: y * 10000 + 101, maxKey: y * 10000 + 1231 };
        }
        const m = Number(month);
        const daysInMonth = new Date(y, m, 0).getDate();
        if (!day) {
            return { minKey: y * 10000 + m * 100 + 1, maxKey: y * 10000 + m * 100 + daysInMonth };
        }
        const d = Number(day);
        return { minKey: y * 10000 + m * 100 + d, maxKey: y * 10000 + m * 100 + d };
    }

    /**
     * 反対側入力を考慮した選択可能日付範囲を計算する。
     * @param {*} kind
     */
    function getConstrainedBounds(kind) {
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
     * @param {*} bounds
     */
    function initDateSelects(bounds) {
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
     * @param {*} songs
     */
    function buildDateIndex(songs) {
        const index = new Map();
        for (const row of songs) {
            if (!row.dateKey) continue;
            const { year, month, day } = dateKeyToParts(row.dateKey);
            const key = `${year}-${String(month).padStart(2, "0")}`;
            if (!index.has(key)) index.set(key, new Set());
            index.get(key).add(day);
        }
        const normalized = new Map();
        for (const [key, set] of index.entries()) {
            normalized.set(key, Array.from(set).sort((a, b) => a - b));
        }
        return normalized;
    }

    /**
     * 指定した年/月で選択可能な日一覧を返す。
     * @param {*} year
     * @param {*} month
     */
    function getAvailableDays(year, month) {
        if (!dateUi.index) return [];
        const key = `${year}-${month}`;
        return dateUi.index.get(key) || [];
    }

    /**
     * セレクト要素の選択肢を再構築する。
     * @param {*} select
     * @param {*} values
     * @param {*} placeholder
     */
    function buildSelectOptions(select, values, placeholder) {
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
     * @param {*} kind
     */
    function syncDateSelectOptions(kind) {
        if (!dateUi.bounds) return;
        const targets = kind ? [kind] : ["from", "to"];
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
    function applyPendingDateValues() {
        if (!dateUi.pendingValues) return;
        const { from, to } = dateUi.pendingValues;
        if (from) applyDateSelectValue("from", from);
        if (to) applyDateSelectValue("to", to);
        dateUi.pendingValues = null;
    }

    /**
     * 開始値から終了値までの連番配列を生成する。
     * @param {*} start
     * @param {*} end
     */
    function buildNumberRange(start, end) {
        const list = [];
        for (let i = start; i <= end; i++) list.push(i);
        return list;
    }

    /**
     * 日付キーを `YYYY-MM-DD` 形式へ整形する。
     * @param {*} key
     */
    function formatDateKeyForInput(key) {
        const year = Math.floor(key / 10000);
        const month = Math.floor((key % 10000) / 100);
        const day = key % 100;
        const mm = String(month).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${year}-${mm}-${dd}`;
    }

    /**
     * 曲一覧から日付境界を計算し、日付 UI へ反映する。
     * @param {*} songs
     */
    function applyDateInputRange(songs) {
        const dateFromYear = ui.el.dateFromYear;
        const dateFromMonth = ui.el.dateFromMonth;
        const dateFromDay = ui.el.dateFromDay;
        const dateToYear = ui.el.dateToYear;
        const dateToMonth = ui.el.dateToMonth;
        const dateToDay = ui.el.dateToDay;
        if (!dateFromYear || !dateFromMonth || !dateFromDay || !dateToYear || !dateToMonth || !dateToDay) return null;
        let minKey = null;
        let maxKey = null;
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
     * 日付入力を許容範囲内に収め、前後関係を補正する。
     * @param {*} minKey
     * @param {*} maxKey
     */
    function clampDateInputsToBounds(minKey, maxKey) {
        const dateFromYear = ui.el.dateFromYear;
        const dateFromMonth = ui.el.dateFromMonth;
        const dateFromDay = ui.el.dateFromDay;
        const dateToYear = ui.el.dateToYear;
        const dateToMonth = ui.el.dateToMonth;
        const dateToDay = ui.el.dateToDay;
        if (!dateFromYear || !dateFromMonth || !dateFromDay || !dateToYear || !dateToMonth || !dateToDay) return;
        const clampKey = (key) => {
            if (key === null) return null;
            if (key < minKey) return minKey;
            if (key > maxKey) return maxKey;
            return key;
        };
        let fromKey = clampKey(parseDateKey(getDateSelectValue("from")));
        let toKey = clampKey(parseDateKey(getDateSelectValue("to")));
        if (fromKey !== null && toKey !== null && fromKey > toKey) {
            toKey = fromKey;
        }
        if (fromKey === null && toKey === null) return;
        dateFromYear.value = "";
        dateFromMonth.value = "";
        dateFromDay.value = "";
        dateToYear.value = "";
        dateToMonth.value = "";
        dateToDay.value = "";
        syncDateSelectOptions();
        if (fromKey !== null) applyDateSelectValue("from", formatDateKeyForInput(fromKey));
        if (toKey !== null) applyDateSelectValue("to", formatDateKeyForInput(toKey));
    }

    /**
     * 日付境界がある場合に入力値の範囲補正を行う。
     */
    function clampDateInputsIfNeeded() {
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
