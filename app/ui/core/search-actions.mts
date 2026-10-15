import type { SearchUiRuntimeState } from "../../state.types";
import { isHtmlElement } from "../../lib/dom-utils.mjs";
import { getSearchBooleanFilterElements } from "../../lib/search-boolean-filters.mjs";
import type { SearchBooleanFilterElements, SearchBooleanFilterKey } from "../../lib/search-boolean-filters.mjs";
import {
    clearSearchQueryValidation,
    clearSearchQueryValidationIfValid,
    validateSearchQueryInput
} from "../search-query-validation.mjs";
import type { DateSelectKind } from "../date/filter.mjs";

type SearchScheduleOptions = {
    immediate?: boolean;
};

type SearchActionEventOptions = Event | SearchScheduleOptions;

type SearchActionsDateFilterController = {
    resetDateSelects: () => void;
    hasDateSelection: () => boolean;
    commitDateSelectionClear: (kind: DateSelectKind) => void;
};

type SearchActionsSearchCoordinator = {
    cancelScheduledSearch: () => void;
    scheduleSearch: (options?: SearchScheduleOptions) => void;
};

type SearchActionsSearchFiltersController = {
    resetFiltersToDefault: (options: { resetDateSelects: () => void }) => void;
    setSelectedFormatsToDefault: () => void;
    syncFormatCheckboxesFromState: () => void;
    needsFilterReset: (options: { hasDateSelection: () => boolean }) => boolean;
};

type SearchActionsStorageController = {
    saveSearchState: () => void;
    clearActiveBookmark: () => void;
};

type SearchUiActionsInput = {
    ui: { el: {
        searchBox?: Parameters<typeof clearSearchQueryValidation>[0];
        searchBoxError?: Parameters<typeof clearSearchQueryValidation>[1];
        clearBtn?: Pick<HTMLButtonElement, "addEventListener"> | null;
    } & SearchBooleanFilterElements };
    search: Pick<SearchUiRuntimeState, "dataReady" | "userTouchedQuery" | "userTouchedFilters">;
    searchFiltersController: SearchActionsSearchFiltersController;
    dateFilterController: SearchActionsDateFilterController;
    searchCoordinator: SearchActionsSearchCoordinator;
    storageController: SearchActionsStorageController;
};

/**
 * 日付・検索実行・保存の各 controller を使い、検索 UI のリセット・同期操作を束ねる。
 * @param {SearchUiActionsInput} input
 */
export function createSearchUiActions({
    ui,
    search,
    searchFiltersController,
    dateFilterController,
    searchCoordinator,
    storageController
}: SearchUiActionsInput) {
    /**
     * 保留中の検索デバウンスタイマーを解除する。
     */
    function clearSearchDebounce(): void {
        searchCoordinator.cancelScheduledSearch();
    }

    /**
     * 検索語入力を初期化する。
     */
    function resetSearchQuery(): void {
        if (ui.el.searchBox) ui.el.searchBox.value = "";
        clearSearchQueryValidation(ui.el.searchBox, ui.el.searchBoxError);
        search.userTouchedQuery = false;
    }

    /**
     * フィルタ条件を既定状態へ戻す。
     */
    function resetSearchFilters(): void {
        searchFiltersController.resetFiltersToDefault({
            resetDateSelects: () => dateFilterController.resetDateSelects()
        });
    }

    /**
     * 検索語とフィルタをまとめて初期化し必要なら再検索する。
     * @param {boolean} shouldSearch
     */
    function resetSearchConditions(shouldSearch: boolean): void {
        clearSearchDebounce();
        resetSearchQuery();
        resetSearchFilters();
        if (shouldSearch && search.dataReady) {
            searchCoordinator.scheduleSearch({ immediate: true });
        }
    }

    /**
     * 検索条件とアクティブブックマークをリセットして保存する。
     */
    function clearSearch(): void {
        resetSearchConditions(false);
        storageController.clearActiveBookmark();
    }

    /**
     * フィルタ操作済みフラグを立てて検索・保存を行う。
     * @param {Event | { immediate?: boolean }} [options]
     */
    function markFilterTouched(options?: SearchActionEventOptions): void {
        search.userTouchedFilters = true;
        const scheduleOptions = options && "immediate" in options ? options : undefined;
        searchCoordinator.scheduleSearch(scheduleOptions);
        storageController.saveSearchState();
    }

    /**
     * 検索語操作済みフラグを立てて検索・保存を行う。
     */
    function markQueryTouched(): void {
        search.userTouchedQuery = true;
        searchCoordinator.scheduleSearch();
        storageController.saveSearchState();
    }

    /**
     * 検索語だけを解除し、検索と保存を 1 回ずつ即時に行う。
     */
    function clearSearchQuery(): void {
        clearSearchDebounce();
        if (ui.el.searchBox) ui.el.searchBox.value = "";
        clearSearchQueryValidation(ui.el.searchBox, ui.el.searchBoxError);
        search.userTouchedQuery = true;
        searchCoordinator.scheduleSearch({ immediate: true });
        storageController.saveSearchState();
    }

    /**
     * 指定側の日付範囲だけを解除する。検索と保存は日付 controller の変更通知で 1 回ずつ行う。
     * @param kind 解除する側
     */
    function clearDateFilter(kind: DateSelectKind): void {
        dateFilterController.commitDateSelectionClear(kind);
    }

    /**
     * 動画の種類の選択を既定 (すべて) に戻し、UI 同期後に検索と保存を 1 回ずつ行う。
     */
    function resetFormatFilters(): void {
        searchFiltersController.setSelectedFormatsToDefault();
        searchFiltersController.syncFormatCheckboxesFromState();
        markFilterTouched({ immediate: true });
    }

    /**
     * 指定した真偽値フィルターだけを解除し、検索と保存を 1 回ずつ行う。
     * @param {SearchBooleanFilterKey} key
     */
    function clearBooleanFilter(key: SearchBooleanFilterKey): void {
        const checkbox = ui.el[key];
        if (checkbox) checkbox.checked = false;
        markFilterTouched({ immediate: true });
    }

    /**
     * 未操作時に検索語の不整合があればリセットする。
     * @returns {boolean}
     */
    function syncSearchQueryIfNeeded(): boolean {
        if (search.userTouchedQuery) return false;
        const searchBox = ui.el.searchBox;
        if (!searchBox || searchBox.value === "") return false;
        resetSearchQuery();
        return true;
    }

    /**
     * 未操作時にフィルタの不整合があればリセットする。
     * @returns {boolean}
     */
    function syncSearchFiltersIfNeeded(): boolean {
        searchFiltersController.syncFormatCheckboxesFromState();
        if (search.userTouchedFilters) return false;
        if (!searchFiltersController.needsFilterReset({
            hasDateSelection: () => dateFilterController.hasDateSelection()
        })) {
            return false;
        }
        resetSearchFilters();
        return true;
    }

    /**
     * 検索語・フィルタ同期の結果に応じて再検索する。
     */
    function syncSearchUI(): void {
        const queryChanged = syncSearchQueryIfNeeded();
        const filtersChanged = syncSearchFiltersIfNeeded();
        const shouldSearch = queryChanged || filtersChanged;
        if (shouldSearch && search.dataReady) {
            searchCoordinator.scheduleSearch({ immediate: true });
        }
    }

    /**
     * 検索語・真偽値フィルター・条件クリアボタンの操作を受け付ける。
     * 検索語とフィルターの要素は値の読み書きに必要な形だけを型で受け取るため、
     * イベントを付ける前に実際の要素かを確かめる。
     */
    function setupSearchFormHandlers(): void {
        getSearchBooleanFilterElements(ui).forEach((checkbox) => {
            if (!isHtmlElement(checkbox)) return;
            checkbox.addEventListener("change", () => {
                markFilterTouched();
            });
        });
        const searchBox = ui.el.searchBox;
        if (isHtmlElement(searchBox)) {
            searchBox.addEventListener("input", () => {
                clearSearchQueryValidationIfValid(ui.el.searchBox, ui.el.searchBoxError);
                markQueryTouched();
            });
            searchBox.addEventListener("blur", () => {
                validateSearchQueryInput(ui.el.searchBox, ui.el.searchBoxError);
            });
        }
        ui.el.clearBtn?.addEventListener("click", clearSearch);
    }

    return {
        clearSearch,
        clearSearchQuery,
        clearDateFilter,
        resetFormatFilters,
        clearBooleanFilter,
        markFilterTouched,
        markQueryTouched,
        clearSearchDebounce,
        resetSearchConditions,
        syncSearchUI,
        setupSearchFormHandlers
    };
}
