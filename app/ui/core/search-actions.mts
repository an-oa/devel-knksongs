import type { AppUiState, SearchUiRuntimeState } from "../../state.types";
import { clearSearchQueryValidation } from "../search-query-validation.mjs";

type SearchScheduleOptions = {
    immediate?: boolean;
};

type SearchActionEventOptions = Event | SearchScheduleOptions;

type SearchActionsSearchController = {
    syncDateSelectOptions: (kind?: string) => void;
    scheduleSearch: (options?: SearchScheduleOptions) => void;
    resetDateSelects: () => void;
    resetDateSelectGroup: (kind: string) => void;
    hasDateSelection: () => boolean;
};

type SearchActionsSearchFiltersController = {
    resetFiltersToDefault: (options: { resetDateSelects: () => void }) => void;
    syncFormatCheckboxesFromState: () => void;
    needsFilterReset: (options: { hasDateSelection: () => boolean }) => boolean;
};

type SearchActionsStorageController = {
    saveSearchState: () => void;
    clearActiveBookmark: () => void;
};

type SearchUiActionsInput = {
    ui: AppUiState;
    search: SearchUiRuntimeState;
    searchFiltersController: SearchActionsSearchFiltersController;
    getSearchController: () => SearchActionsSearchController;
    getStorageController: () => SearchActionsStorageController;
};

/**
 * bootstrap から渡された controller 群を使い、検索 UI のリセット・同期操作を束ねる。
 * controller 同士の生成順に依存しすぎないよう、相互参照は getter で遅延解決する。
 * @param {SearchUiActionsInput} input
 */
export function createSearchUiActions({
    ui,
    search,
    searchFiltersController,
    getSearchController,
    getStorageController
}: SearchUiActionsInput) {
    /**
     * 指定側の日付セレクトをクリアして候補を同期する。
     * @param {string} kind
     */
    function resetDateSelectGroup(kind: string): void {
        getSearchController().resetDateSelectGroup(kind);
    }

    /**
     * 保留中の検索デバウンスタイマーを解除する。
     */
    function clearSearchDebounce(): void {
        if (search.debounceId) {
            clearTimeout(search.debounceId);
            search.debounceId = 0;
        }
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
            resetDateSelects: () => getSearchController().resetDateSelects()
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
            getSearchController().scheduleSearch({ immediate: true });
        }
    }

    /**
     * 検索条件とアクティブブックマークをリセットして保存する。
     */
    function clearSearch(): void {
        resetSearchConditions(false);
        getStorageController().clearActiveBookmark();
    }

    /**
     * フィルタ操作済みフラグを立てて検索・保存を行う。
     * @param {Event | { immediate?: boolean }} [options]
     */
    function markFilterTouched(options?: SearchActionEventOptions): void {
        search.userTouchedFilters = true;
        const scheduleOptions = options && "immediate" in options ? options : undefined;
        getSearchController().scheduleSearch(scheduleOptions);
        getStorageController().saveSearchState();
    }

    /**
     * 検索語操作済みフラグを立てて検索・保存を行う。
     */
    function markQueryTouched(): void {
        search.userTouchedQuery = true;
        getSearchController().scheduleSearch();
        getStorageController().saveSearchState();
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
            hasDateSelection: () => getSearchController().hasDateSelection()
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
        const shouldSearch = syncSearchQueryIfNeeded() || syncSearchFiltersIfNeeded();
        if (shouldSearch && search.dataReady) {
            getSearchController().scheduleSearch({ immediate: true });
        }
    }

    return {
        resetDateSelectGroup,
        clearSearch,
        markFilterTouched,
        markQueryTouched,
        clearSearchDebounce,
        resetSearchConditions,
        syncSearchUI
    };
}
