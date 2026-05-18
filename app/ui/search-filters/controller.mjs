import { createFrameScopeFilterController } from "../frame-scope/filter.mjs?v=18";
import { FRAME_SCOPE_ALL } from "../../lib/frame-scope-filter.mjs?v=18";
import { getDateUiState, getSearchUiState } from "../../lib/ui-slices.mjs?v=18";
import { renderSearchFormatOptions, syncSearchFormatCheckboxes } from "./formats.mjs?v=18";

/**
 * 検索条件 UI の個別 filter controller を束ねる facade を作成する。
 * @param {{ ui: object, defaultFormats?: string[] }} input
 * @returns {{
 *   setupFilterOptions: (options?: { onFilterChange?: (event: Event) => void }) => void,
 *   renderFilterOptions: (options?: { onFormatChange?: (event: Event) => void }) => void,
 *   getSelectedFormatValues: () => string[],
 *   setSelectedFormatsToDefault: () => void,
 *   applySelectedFormats: (formats: unknown) => void,
 *   syncFormatCheckboxesFromState: () => void,
 *   areAllFormatsSelected: () => boolean,
 *   areFormatsDefault: () => boolean,
 *   getSelectedFrameScopeValue: () => string,
 *   applyFrameScopeValue: (rawValue: unknown) => void,
 *   setFrameScopeToDefault: () => void,
 *   isFrameScopeDefault: () => boolean,
 *   addFrameScopeChangeListener: (listener: EventListener) => void,
 *   applyStoredFilterState: (payload: Record<string, unknown>) => void,
 *   resetFiltersToDefault: (options?: { resetDateSelects?: () => void }) => void,
 *   needsFilterReset: (options?: { hasDateSelection?: () => boolean }) => boolean
 * }}
 */
export function createSearchFiltersController({ ui, defaultFormats = [] }) {
    const searchUi = getSearchUiState(ui) || ui;
    const dateUi = getDateUiState(ui) || null;
    const frameScopeFilterController = createFrameScopeFilterController({ ui });
    let didRegisterFrameScopeChangeListener = false;

    /**
     * フォーマット選択 state を Set として取得する。
     * @returns {Set<string>}
     */
    function getSelectedFormats() {
        if (!(searchUi.selectedFormats instanceof Set)) {
            searchUi.selectedFormats = new Set();
        }
        return searchUi.selectedFormats;
    }

    /**
     * 検索条件 UI の選択肢を描画する。
     * @param {{ onFormatChange?: (event: Event) => void } | undefined} options
     */
    function renderFilterOptions(options) {
        renderSearchFormatOptions({
            searchUi,
            formatsList: ui.el.formatsList,
            defaultFormats,
            onChange: options && options.onFormatChange
        });
        frameScopeFilterController.renderFrameScopeOptions();
    }

    /**
     * 検索条件 UI の選択肢を描画し、filter 共通の変更イベントを設定する。
     * @param {{ onFilterChange?: (event: Event) => void } | undefined} options
     */
    function setupFilterOptions(options) {
        const onFilterChange = options && options.onFilterChange;
        renderFilterOptions({ onFormatChange: onFilterChange });
        if (typeof onFilterChange === "function" && !didRegisterFrameScopeChangeListener) {
            frameScopeFilterController.addChangeListener(onFilterChange);
            didRegisterFrameScopeChangeListener = true;
        }
    }

    /**
     * 選択中フォーマットを保存用の配列として返す。
     * @returns {string[]}
     */
    function getSelectedFormatValues() {
        return Array.from(getSelectedFormats());
    }

    /**
     * 選択中フォーマットを既定値に戻す。
     */
    function setSelectedFormatsToDefault() {
        const selectedFormats = getSelectedFormats();
        selectedFormats.clear();
        defaultFormats.forEach((format) => selectedFormats.add(format));
    }

    /**
     * 正規化済みの保存値からフォーマット選択を復元する。
     * @param {unknown} formats
     */
    function applySelectedFormats(formats) {
        const selectedFormats = getSelectedFormats();
        const allowedFormats = new Set(defaultFormats);
        const storedFormats = Array.isArray(formats) ? formats : defaultFormats;
        selectedFormats.clear();
        storedFormats.forEach((format) => {
            if (!allowedFormats.has(format) || selectedFormats.has(format)) return;
            selectedFormats.add(format);
        });
        if (selectedFormats.size === 0) {
            defaultFormats.forEach((format) => selectedFormats.add(format));
        }
        syncFormatCheckboxesFromState();
    }

    /**
     * state上のフォーマット選択状態をチェックボックスへ同期する。
     */
    function syncFormatCheckboxesFromState() {
        syncSearchFormatCheckboxes({
            searchUi: { selectedFormats: getSelectedFormats() },
            formatsList: ui.el.formatsList
        });
    }

    /**
     * 既定フォーマットがすべて選択されているか判定する。
     * @returns {boolean}
     */
    function areAllFormatsSelected() {
        const selectedFormats = getSelectedFormats();
        return defaultFormats.every((format) => selectedFormats.has(format));
    }

    /**
     * フォーマット選択が既定状態と一致するか判定する。
     * @returns {boolean}
     */
    function areFormatsDefault() {
        return getSelectedFormats().size === defaultFormats.length && areAllFormatsSelected();
    }

    /**
     * 選択中の配信での立場フィルタ値を返す。
     * @returns {string}
     */
    function getSelectedFrameScopeValue() {
        return frameScopeFilterController.getSelectedFrameScopeValue();
    }

    /**
     * 保存値から配信での立場フィルタを反映する。
     * @param {unknown} rawValue
     */
    function applyFrameScopeValue(rawValue) {
        frameScopeFilterController.applyFrameScopeValue(rawValue);
    }

    /**
     * 配信での立場フィルタを既定値へ戻す。
     */
    function setFrameScopeToDefault() {
        frameScopeFilterController.setFrameScopeToDefault();
    }

    /**
     * 配信での立場フィルタが既定状態か判定する。
     * @returns {boolean}
     */
    function isFrameScopeDefault() {
        return getSelectedFrameScopeValue() === FRAME_SCOPE_ALL;
    }

    /**
     * 配信での立場フィルタの変更監視を追加する。
     * @param {EventListener} listener
     */
    function addFrameScopeChangeListener(listener) {
        frameScopeFilterController.addChangeListener(listener);
    }

    /**
     * 保存済み payload のうち検索フィルタ UI が所有する値を反映する。
     * @param {Record<string, unknown>} payload
     */
    function applyStoredFilterState(payload) {
        applySelectedFormats(payload.formats);
        if (ui.el.relayOnly) ui.el.relayOnly.checked = !!payload.relayOnly;
        if (ui.el.harmonyOnly) ui.el.harmonyOnly.checked = !!payload.harmonyOnly;
        applyFrameScopeValue(payload.frameScope);
    }

    /**
     * リレー・ハモリフィルタを既定状態へ戻す。
     */
    function resetBooleanFiltersToDefault() {
        if (ui.el.relayOnly) ui.el.relayOnly.checked = false;
        if (ui.el.harmonyOnly) ui.el.harmonyOnly.checked = false;
    }

    /**
     * 検索フィルタ UI を既定状態へ戻す。
     * @param {{ resetDateSelects?: () => void } | undefined} options
     */
    function resetFiltersToDefault(options) {
        resetBooleanFiltersToDefault();
        if (options && typeof options.resetDateSelects === "function") {
            options.resetDateSelects();
        }
        if (dateUi) dateUi.pendingValues = null;
        setSelectedFormatsToDefault();
        syncFormatCheckboxesFromState();
        setFrameScopeToDefault();
        searchUi.userTouchedFilters = false;
    }

    /**
     * フィルタが既定状態から外れているか判定する。
     * @param {{ hasDateSelection?: () => boolean } | undefined} options
     * @returns {boolean}
     */
    function needsFilterReset(options) {
        if (ui.el.relayOnly && ui.el.relayOnly.checked) return true;
        if (ui.el.harmonyOnly && ui.el.harmonyOnly.checked) return true;
        if (options && typeof options.hasDateSelection === "function" && options.hasDateSelection()) return true;
        if (!isFrameScopeDefault()) return true;
        return !areFormatsDefault();
    }

    return {
        setupFilterOptions,
        renderFilterOptions,
        getSelectedFormatValues,
        setSelectedFormatsToDefault,
        applySelectedFormats,
        syncFormatCheckboxesFromState,
        areAllFormatsSelected,
        areFormatsDefault,
        getSelectedFrameScopeValue,
        applyFrameScopeValue,
        setFrameScopeToDefault,
        isFrameScopeDefault,
        addFrameScopeChangeListener,
        applyStoredFilterState,
        resetFiltersToDefault,
        needsFilterReset
    };
}
