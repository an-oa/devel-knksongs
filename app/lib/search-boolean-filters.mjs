export const SEARCH_BOOLEAN_FILTER_KEYS = [
    "collabHostOnly",
    "collabGuestOnly",
    "relayOnly",
    "harmonyOnly"
];

/**
 * 検索 boolean filter に対応する UI 要素を取得する。
 * @param {{ el?: Record<string, *> } | null | undefined} ui
 * @param {string} key
 * @returns {* | null}
 */
export function getSearchBooleanFilterElement(ui, key) {
    if (!ui || !ui.el) return null;
    return ui.el[key] || null;
}

/**
 * 検索 boolean filter の UI 要素一覧を返す。
 * @param {{ el?: Record<string, *> } | null | undefined} ui
 * @returns {*[]}
 */
export function getSearchBooleanFilterElements(ui) {
    return SEARCH_BOOLEAN_FILTER_KEYS
        .map((key) => getSearchBooleanFilterElement(ui, key))
        .filter(Boolean);
}

/**
 * 検索 boolean filter の checked 値を state/payload 用 object として収集する。
 * @param {{ el?: Record<string, *> } | null | undefined} ui
 * @returns {Record<string, boolean>}
 */
export function collectSearchBooleanFilterState(ui) {
    return Object.fromEntries(SEARCH_BOOLEAN_FILTER_KEYS.map((key) => {
        const element = getSearchBooleanFilterElement(ui, key);
        return [key, Boolean(element && element.checked)];
    }));
}

/**
 * 保存済み payload の検索 boolean filter 値を UI へ反映する。
 * @param {{ el?: Record<string, *> } | null | undefined} ui
 * @param {Record<string, unknown>} payload
 */
export function applySearchBooleanFilterState(ui, payload) {
    SEARCH_BOOLEAN_FILTER_KEYS.forEach((key) => {
        const element = getSearchBooleanFilterElement(ui, key);
        if (element) element.checked = Boolean(payload[key]);
    });
}

/**
 * 検索 boolean filter の UI を既定状態へ戻す。
 * @param {{ el?: Record<string, *> } | null | undefined} ui
 */
export function resetSearchBooleanFilters(ui) {
    SEARCH_BOOLEAN_FILTER_KEYS.forEach((key) => {
        const element = getSearchBooleanFilterElement(ui, key);
        if (element) element.checked = false;
    });
}

/**
 * 検索 boolean filter の UI に有効な項目があるか判定する。
 * @param {{ el?: Record<string, *> } | null | undefined} ui
 * @returns {boolean}
 */
export function hasEnabledSearchBooleanFilter(ui) {
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
export function hasSelectedSearchBooleanFilterState(searchState) {
    return SEARCH_BOOLEAN_FILTER_KEYS.some((key) => Boolean(searchState[key]));
}
