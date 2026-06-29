import { getDateUiState, getSearchUiState } from "../../lib/ui-slices.mjs";
import {
    applySearchBooleanFilterState,
    hasEnabledSearchBooleanFilter,
    resetSearchBooleanFilters
} from "../../lib/search-boolean-filters.mjs";
import { renderSearchFormatOptions, syncSearchFormatCheckboxes } from "./formats.mjs";
import type {
    AppUiElements,
    DateUiRuntimeState,
    SearchUiRuntimeState
} from "../../state.types";

type SearchFiltersSearchState = Pick<SearchUiRuntimeState, "selectedFormats" | "userTouchedFilters"> &
    Partial<SearchUiRuntimeState>;

type SearchFiltersDateState = Pick<DateUiRuntimeState, "pendingValues"> & Partial<DateUiRuntimeState>;

type SearchFiltersUiState = {
    el: Pick<AppUiElements, "formatsList"> & Record<string, unknown>;
    search: SearchFiltersSearchState;
    date?: SearchFiltersDateState | null;
};

type SearchFilterChangeOptions = {
    onFilterChange?: (event: Event) => void;
};

type SearchFormatChangeOptions = {
    onFormatChange?: (event: Event) => void;
};

type SearchFilterResetOptions = {
    resetDateSelects?: () => void;
};

type SearchFilterResetCheckOptions = {
    hasDateSelection?: () => boolean;
};

type SearchFiltersControllerInput = {
    ui: SearchFiltersUiState;
    defaultFormats?: string[];
};

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
 *   applyStoredFilterState: (payload: Record<string, unknown>) => void,
 *   resetFiltersToDefault: (options?: { resetDateSelects?: () => void }) => void,
 *   needsFilterReset: (options?: { hasDateSelection?: () => boolean }) => boolean
 * }}
 */
export function createSearchFiltersController({ ui, defaultFormats = [] }: SearchFiltersControllerInput) {
    const searchUiState = getSearchUiState(ui as unknown as { search: SearchUiRuntimeState });
    const dateUi = ui.date ? getDateUiState(ui as unknown as { date: DateUiRuntimeState }) : null;

    /**
     * フォーマット選択 state を Set として取得する。
     * @returns {Set<string>}
     */
    function getSelectedFormats(): Set<string> {
        if (!(searchUiState.selectedFormats instanceof Set)) {
            searchUiState.selectedFormats = new Set();
        }
        return searchUiState.selectedFormats;
    }

    /**
     * 検索条件 UI の選択肢を描画する。
     * @param {{ onFormatChange?: (event: Event) => void } | undefined} options
     */
    function renderFilterOptions(options?: SearchFormatChangeOptions): void {
        renderSearchFormatOptions({
            selectedFormats: getSelectedFormats(),
            formatsList: ui.el.formatsList,
            defaultFormats,
            onChange: options && options.onFormatChange
        });
    }

    /**
     * 検索条件 UI の選択肢を描画し、filter 共通の変更イベントを設定する。
     * @param {{ onFilterChange?: (event: Event) => void } | undefined} options
     */
    function setupFilterOptions(options?: SearchFilterChangeOptions): void {
        const onFilterChange = options && options.onFilterChange;
        renderFilterOptions({ onFormatChange: onFilterChange });
    }

    /**
     * 選択中フォーマットを保存用の配列として返す。
     * @returns {string[]}
     */
    function getSelectedFormatValues(): string[] {
        return Array.from(getSelectedFormats());
    }

    /**
     * 選択中フォーマットを既定値に戻す。
     */
    function setSelectedFormatsToDefault(): void {
        const selectedFormats = getSelectedFormats();
        selectedFormats.clear();
        defaultFormats.forEach((format) => selectedFormats.add(format));
    }

    /**
     * 正規化済みの保存値からフォーマット選択を復元する。
     * @param {unknown} formats
     */
    function applySelectedFormats(formats: unknown): void {
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
    function syncFormatCheckboxesFromState(): void {
        syncSearchFormatCheckboxes({
            selectedFormats: getSelectedFormats(),
            formatsList: ui.el.formatsList
        });
    }

    /**
     * 既定フォーマットがすべて選択されているか判定する。
     * @returns {boolean}
     */
    function areAllFormatsSelected(): boolean {
        const selectedFormats = getSelectedFormats();
        return defaultFormats.every((format) => selectedFormats.has(format));
    }

    /**
     * フォーマット選択が既定状態と一致するか判定する。
     * @returns {boolean}
     */
    function areFormatsDefault(): boolean {
        return getSelectedFormats().size === defaultFormats.length && areAllFormatsSelected();
    }

    /**
     * 保存済み payload のうち検索フィルタ UI が所有する値を反映する。
     * @param {Record<string, unknown>} payload
     */
    function applyStoredFilterState(payload: Record<string, unknown>): void {
        applySelectedFormats(payload.formats);
        applySearchBooleanFilterState(ui, payload);
    }

    /**
     * コラボ種別・リレー・ハモリフィルタを既定状態へ戻す。
     */
    function resetBooleanFiltersToDefault(): void {
        resetSearchBooleanFilters(ui);
    }

    /**
     * 検索フィルタ UI を既定状態へ戻す。
     * @param {{ resetDateSelects?: () => void } | undefined} options
     */
    function resetFiltersToDefault(options?: SearchFilterResetOptions): void {
        resetBooleanFiltersToDefault();
        if (options && typeof options.resetDateSelects === "function") {
            options.resetDateSelects();
        }
        if (dateUi) dateUi.pendingValues = null;
        setSelectedFormatsToDefault();
        syncFormatCheckboxesFromState();
        searchUiState.userTouchedFilters = false;
    }

    /**
     * フィルタが既定状態から外れているか判定する。
     * @param {{ hasDateSelection?: () => boolean } | undefined} options
     * @returns {boolean}
     */
    function needsFilterReset(options?: SearchFilterResetCheckOptions): boolean {
        if (hasEnabledSearchBooleanFilter(ui)) return true;
        if (options && typeof options.hasDateSelection === "function" && options.hasDateSelection()) return true;
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
        applyStoredFilterState,
        resetFiltersToDefault,
        needsFilterReset
    };
}
