import { createDateFilterController } from "../ui/date/filter.mjs";
import { filterSongsByCriteria, isValidEmptySearchQuery } from "../lib/search-filters.mjs";
import { pickRecommendedSongsWithCache } from "../lib/search-recommendation.mjs";
import {
    collectSearchBooleanFilterState,
    hasSelectedSearchBooleanFilterState
} from "../lib/search-boolean-filters.mjs";
import { resolveSongRefs } from "../lib/song-lookup.mjs";
import { validateSearchQueryInput } from "../ui/search-query-validation.mjs";

type SearchOutcomeApplyOptions = {
    scrollToTop?: boolean;
};

/**
 * 検索条件の収集・結果解決・推薦選曲を管理するコントローラーを作成する。
 * @param {SearchControllerInput} input
 */
export function createSearchController({
    data,
    ui,
    searchFiltersController,
    constants,
    callbacks
}: SearchControllerInput) {
    const {
        RANDOM_DISPLAY_COUNT,
        MIN_PERFORMANCE_FOR_RANDOM,
        RESULT_DISPLAY_BATCH_SIZE,
        SEARCH_DEBOUNCE_MS
    } = constants;
    const searchUiState = ui.search;
    const lookupUi = ui.lookup;
    const dateFilterController = createDateFilterController({ ui });
    const updateDisplay = callbacks.updateDisplay;
    const scrollResultsPaneToTop = callbacks.scrollResultsPaneToTop;
    const getRecommendedDisplayCount = callbacks.getRecommendedDisplayCount || (() => RANDOM_DISPLAY_COUNT);

    /**
     * デバウンス付きで検索実行を予約し、必要時は即時実行する。
     * @param {{ immediate?: boolean }} [options]
     */
    function scheduleSearch(options?: { immediate?: boolean }): void {
        if (searchUiState.debounceId) clearTimeout(searchUiState.debounceId);
        if (options && options.immediate) {
            search();
            return;
        }
        searchUiState.debounceId = setTimeout(() => {
            searchUiState.debounceId = 0;
            search();
        }, SEARCH_DEBOUNCE_MS);
    }

    /**
     * 検索入力の収集から結果反映までの処理を行う。
     */
    function search(): void {
        validateSearchQueryInput(ui.el.searchBox, ui.el.searchBoxError);
        const searchInput = collectSearchInput();
        const outcome = resolveSearchResults(searchInput.searchState);
        applySearchOutcome(searchInput, outcome);
    }

    /**
     * 検索実行に必要な入力情報を収集する。
     * @returns {SearchInput}
     */
    function collectSearchInput(): SearchInput {
        return {
            searchState: getSearchState(),
            resultCountEl: ui.el.resultCount
        };
    }

    /**
     * 検索結果を state と UI へ反映する。
     * @param {SearchInput} searchInput
     * @param {SearchOutcome} outcome
     * @param {SearchOutcomeApplyOptions} [options]
     */
    function applySearchOutcome(
        searchInput: SearchInput,
        outcome: SearchOutcome,
        options: SearchOutcomeApplyOptions = {}
    ): void {
        data.currentResults = outcome.results;
        data.displayLimit = outcome.displayLimit;
        if (searchInput.resultCountEl) searchInput.resultCountEl.innerText = outcome.label;
        updateDisplay();
        if (options.scrollToTop !== false) scrollResultsPaneToTop();
    }

    /**
     * 現在の UI 入力から検索条件オブジェクトを生成する。
     * @returns {SearchState}
     */
    function getSearchState(): SearchState {
        const fromRange = dateFilterController.getPartialDateRange("from");
        const toRange = dateFilterController.getPartialDateRange("to");
        return {
            queryRaw: ui.el.searchBox.value.trim(),
            ...collectSearchBooleanFilterState(ui),
            dateFromKey: fromRange ? fromRange.minKey : null,
            dateToKey: toRange ? toRange.maxKey : null,
            hasDateFilter: Boolean(fromRange || toRange)
        };
    }

    /**
     * 条件未指定時のおすすめ表示モードかどうかを判定する。
     * @param {SearchState} searchState
     * @returns {boolean}
     */
    function isRecommendedMode(searchState: SearchState): boolean {
        return !data.activeBookmark &&
            isValidEmptySearchQuery(searchState.queryRaw) &&
            !hasSelectedSearchBooleanFilterState(searchState) &&
            !searchState.hasDateFilter &&
            searchFiltersController.areAllFormatsSelected();
    }

    /**
     * 通常検索・ブックマーク検索・おすすめ表示を切り替えて結果を作る。
     * @param {SearchState} searchState
     * @returns {SearchOutcome}
     */
    function resolveSearchResults(searchState: SearchState): SearchOutcome {
        if (data.activeBookmark) {
            const bookmark = data.bookmarks[data.activeBookmark];
            if (bookmark) {
                const bookmarkRows = resolveSongRefs(lookupUi, data.allSongsRaw, bookmark.songs);
                const results = filterSongsByCriteria(bookmarkRows, searchState, searchUiState.selectedFormats);
                return buildIncrementalSearchOutcome(
                    results,
                    `ブックマーク: ${bookmark.name} (${results.length} 件)`
                );
            }
        }

        if (isRecommendedMode(searchState)) {
            const recommendedDisplayCount = getRecommendedResultCount();
            const results = pickRecommended(recommendedDisplayCount);
            return {
                results,
                displayLimit: Math.min(results.length, recommendedDisplayCount),
                label: "おすすめを表示中"
            };
        }

        const results = filterSongsByCriteria(data.allSongsRaw, searchState, searchUiState.selectedFormats);
        return buildIncrementalSearchOutcome(results, `${results.length} 件がヒット`);
    }

    /**
     * 段階表示用の件数上限を含む検索結果オブジェクトを作る。
     * @param {Song[]} results
     * @param {string} label
     * @returns {SearchOutcome}
     */
    function buildIncrementalSearchOutcome(results: Song[], label: string): SearchOutcome {
        return {
            results,
            displayLimit: Math.min(results.length, RESULT_DISPLAY_BATCH_SIZE),
            label
        };
    }

    /**
     * おすすめ表示で抽出する件数を、48 件基準と現在の表示領域に合わせて決定する。
     * @returns {number}
     */
    function getRecommendedResultCount(): number {
        const displayCount = getRecommendedDisplayCount();
        const count = Number.isFinite(displayCount) ? Math.floor(displayCount) : RANDOM_DISPLAY_COUNT;
        return Math.max(RANDOM_DISPLAY_COUNT, count);
    }

    /**
     * おすすめ曲をキャッシュ付きで選定して返す。
     * @param {number} count
     * @returns {Song[]}
     */
    function pickRecommended(count: number): Song[] {
        const { songs, cache } = pickRecommendedSongsWithCache(data.allSongsRaw, {
            count,
            minPerformanceCount: MIN_PERFORMANCE_FOR_RANDOM,
            currentCache: searchUiState.recommendedCache
        });
        searchUiState.recommendedCache = cache;
        return songs;
    }

    /**
     * おすすめ表示中だけ、現在の画面サイズに合わせて表示件数を再適用する。
     * リサイズ追随用のため、検索結果ペインのスクロール位置は維持する。
     * @returns {boolean}
     */
    function refreshRecommendedDisplay(): boolean {
        const searchInput = collectSearchInput();
        if (!isRecommendedMode(searchInput.searchState)) return false;
        applySearchOutcome(searchInput, resolveSearchResults(searchInput.searchState), {
            scrollToTop: false
        });
        return true;
    }

    return {
        scheduleSearch,
        search,
        refreshRecommendedDisplay,
        getSearchState,
        isRecommendedMode,
        areAllFormatsSelected: searchFiltersController.areAllFormatsSelected,
        areFormatsDefault: searchFiltersController.areFormatsDefault,
        hasDateSelection: dateFilterController.hasDateSelection,
        getDateSelectValue: dateFilterController.getDateSelectValue,
        applyDateSelectValue: dateFilterController.applyDateSelectValue,
        resetDateSelects: dateFilterController.resetDateSelects,
        resetDateSelectGroup: dateFilterController.resetDateSelectGroup,
        getPartialDateRange: dateFilterController.getPartialDateRange,
        syncDateSelectOptions: dateFilterController.syncDateSelectOptions,
        applyPendingDateValues: dateFilterController.applyPendingDateValues,
        applyDateInputRange: dateFilterController.applyDateInputRange,
        clampDateInputsToBounds: dateFilterController.clampDateInputsToBounds,
        clampDateInputsIfNeeded: dateFilterController.clampDateInputsIfNeeded
    };
}
