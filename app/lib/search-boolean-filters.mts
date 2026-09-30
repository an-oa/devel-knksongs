export const SEARCH_BOOLEAN_FILTER_KEYS = [
    "collabHostOnly",
    "collabGuestOnly",
    "relayOnly",
    "harmonyOnly"
] as const;

export type SearchBooleanFilterKey = typeof SEARCH_BOOLEAN_FILTER_KEYS[number];

type SearchBooleanFilterElement = Pick<HTMLInputElement, "checked">;

/** 真偽値フィルターが必要とする最小限の要素。未設置の要素も許容する。 */
export type SearchBooleanFilterElements<FilterElement extends SearchBooleanFilterElement = SearchBooleanFilterElement> =
    Partial<Record<SearchBooleanFilterKey, FilterElement | null>>;

type SearchBooleanFilterUi<FilterElement extends SearchBooleanFilterElement = SearchBooleanFilterElement> = {
    el?: SearchBooleanFilterElements<FilterElement> & Record<string, unknown>;
} | null | undefined;

/**
 * 検索 boolean filter に対応する UI 要素を取得する。
 * @param {SearchBooleanFilterUi} ui
 * @param {SearchBooleanFilterKey} key
 * @returns {SearchBooleanFilterElement | null}
 */
export function getSearchBooleanFilterElement<FilterElement extends SearchBooleanFilterElement>(
    ui: SearchBooleanFilterUi<FilterElement>,
    key: SearchBooleanFilterKey
): FilterElement | null {
    if (!ui || !ui.el) return null;
    return ui.el[key] || null;
}

/**
 * 検索 boolean filter の UI 要素一覧を返す。
 * @param {SearchBooleanFilterUi} ui
 * @returns {SearchBooleanFilterElement[]}
 */
export function getSearchBooleanFilterElements<FilterElement extends SearchBooleanFilterElement>(
    ui: SearchBooleanFilterUi<FilterElement>
): FilterElement[] {
    return SEARCH_BOOLEAN_FILTER_KEYS
        .map((key) => getSearchBooleanFilterElement(ui, key))
        .filter((element): element is FilterElement => Boolean(element));
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
