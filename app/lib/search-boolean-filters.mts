export const SEARCH_BOOLEAN_FILTER_KEYS = [
    "collabHostOnly",
    "collabGuestOnly",
    "relayOnly",
    "harmonyOnly"
] as const;

type SearchBooleanFilterElement = {
    checked: boolean;
    addEventListener: EventTarget["addEventListener"];
};

type SearchBooleanFilterUi = {
    el?: Record<string, unknown>;
} | null | undefined;

/** @typedef {{ checked: boolean, addEventListener: EventTarget["addEventListener"] }} SearchBooleanFilterElement */
/** @typedef {{ el?: Record<string, unknown> } | null | undefined} SearchBooleanFilterUi */

/**
 * 検索 boolean filter に対応する UI 要素を取得する。
 * @param {SearchBooleanFilterUi} ui
 * @param {string} key
 * @returns {SearchBooleanFilterElement | null}
 */
export function getSearchBooleanFilterElement(
    ui: SearchBooleanFilterUi,
    key: string
): SearchBooleanFilterElement | null {
    if (!ui || !ui.el) return null;
    return (ui.el[key] as SearchBooleanFilterElement | null | undefined) || null;
}

/**
 * 検索 boolean filter の UI 要素一覧を返す。
 * @param {SearchBooleanFilterUi} ui
 * @returns {SearchBooleanFilterElement[]}
 */
export function getSearchBooleanFilterElements(ui: SearchBooleanFilterUi): SearchBooleanFilterElement[] {
    return SEARCH_BOOLEAN_FILTER_KEYS
        .map((key) => getSearchBooleanFilterElement(ui, key))
        .filter((element): element is SearchBooleanFilterElement => Boolean(element));
}

/**
 * 検索 boolean filter の checked 値を state/payload 用 object として収集する。
 * @param {SearchBooleanFilterUi} ui
 * @returns {Record<string, boolean>}
 */
export function collectSearchBooleanFilterState(ui: SearchBooleanFilterUi): Record<string, boolean> {
    return Object.fromEntries(SEARCH_BOOLEAN_FILTER_KEYS.map((key) => {
        const element = getSearchBooleanFilterElement(ui, key);
        return [key, Boolean(element && element.checked)];
    }));
}

/**
 * 保存済み payload の検索 boolean filter 値を UI へ反映する。
 * @param {SearchBooleanFilterUi} ui
 * @param {Record<string, unknown>} payload
 */
export function applySearchBooleanFilterState(ui: SearchBooleanFilterUi, payload: Record<string, unknown>): void {
    SEARCH_BOOLEAN_FILTER_KEYS.forEach((key) => {
        const element = getSearchBooleanFilterElement(ui, key);
        if (element) element.checked = Boolean(payload[key]);
    });
}

/**
 * 検索 boolean filter の UI を既定状態へ戻す。
 * @param {SearchBooleanFilterUi} ui
 */
export function resetSearchBooleanFilters(ui: SearchBooleanFilterUi): void {
    SEARCH_BOOLEAN_FILTER_KEYS.forEach((key) => {
        const element = getSearchBooleanFilterElement(ui, key);
        if (element) element.checked = false;
    });
}

/**
 * 検索 boolean filter の UI に有効な項目があるか判定する。
 * @param {SearchBooleanFilterUi} ui
 * @returns {boolean}
 */
export function hasEnabledSearchBooleanFilter(ui: SearchBooleanFilterUi): boolean {
    return SEARCH_BOOLEAN_FILTER_KEYS.some((key) => {
        const element = getSearchBooleanFilterElement(ui, key);
        return Boolean(element && element.checked);
    });
}

/**
 * 検索状態 object に有効な boolean filter があるか判定する。
 * @param {Record<string, unknown>} searchState
 * @returns {boolean}
 */
export function hasSelectedSearchBooleanFilterState(searchState: Record<string, unknown>): boolean {
    return SEARCH_BOOLEAN_FILTER_KEYS.some((key) => Boolean(searchState[key]));
}
