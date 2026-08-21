import { filterSongsByCriteria } from "../lib/search-filters.mjs";
import { isValidEmptySearchQuery, parseSearchQuery } from "../lib/search-query.mjs";
import type { ParsedSearchQuery } from "../lib/search-query.mjs";
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
    dateFilterController,
    constants,
    callbacks
}: SearchControllerInput) {
    const {
        RANDOM_DISPLAY_COUNT,
        MIN_PERFORMANCE_FOR_RANDOM,
        RESULT_DISPLAY_BATCH_SIZE
    } = constants;
    const searchUiState = ui.search;
    const lookupUi = ui.lookup;
    const updateDisplay = callbacks.updateDisplay;
    const scrollResultsPaneToTop = callbacks.scrollResultsPaneToTop;
    const getRecommendedDisplayCount = callbacks.getRecommendedDisplayCount || (() => RANDOM_DISPLAY_COUNT);

    /**
     * 検索入力の収集から結果反映までの処理を行う。
     */
    function search(): void {
        const searchInput = collectSearchInput();
        validateSearchQueryInput(ui.el.searchBox, ui.el.searchBoxError, searchInput.parsedQuery);
        const outcome = resolveSearchResults(searchInput.searchState, searchInput.parsedQuery);
        applySearchOutcome(searchInput, outcome);
    }

    /**
     * 検索実行に必要な入力情報を収集する。
     * @returns {SearchInput}
     */
    function collectSearchInput(): SearchInput {
        const searchState = getSearchState();
        return {
            searchState,
            parsedQuery: parseSearchQuery(searchState.queryRaw),
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
     * @param parsedQuery 解析済み検索語
     * @returns {boolean}
     */
    function isRecommendedMode(searchState: SearchState, parsedQuery: ParsedSearchQuery): boolean {
        return !data.activeBookmark &&
            isValidEmptySearchQuery(parsedQuery) &&
            !hasSelectedSearchBooleanFilterState(searchState) &&
            !searchState.hasDateFilter &&
            searchFiltersController.areAllFormatsSelected();
    }

    /**
     * 通常検索・ブックマーク検索・おすすめ表示を切り替えて結果を作る。
     * @param {SearchState} searchState
     * @param parsedQuery 解析済み検索語
     * @returns {SearchOutcome}
     */
    function resolveSearchResults(searchState: SearchState, parsedQuery: ParsedSearchQuery): SearchOutcome {
        if (data.activeBookmark) {
            const bookmark = data.bookmarks[data.activeBookmark];
            if (bookmark) {
                const bookmarkRows = resolveSongRefs(lookupUi, data.allSongsRaw, bookmark.songs);
                const results = filterSongsByCriteria(
                    bookmarkRows,
                    searchState,
                    searchUiState.selectedFormats,
                    parsedQuery
                );
                return buildIncrementalSearchOutcome(
                    results,
                    `ブックマーク: ${bookmark.name} (${results.length} 件)`
                );
            }
        }

        if (isRecommendedMode(searchState, parsedQuery)) {
            const recommendedDisplayCount = getRecommendedResultCount();
            const results = pickRecommended(recommendedDisplayCount);
            return {
                results,
                displayLimit: Math.min(results.length, recommendedDisplayCount),
                label: "おすすめを表示中"
            };
        }

        const results = filterSongsByCriteria(
            data.allSongsRaw,
            searchState,
            searchUiState.selectedFormats,
            parsedQuery
        );
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
        if (!isRecommendedMode(searchInput.searchState, searchInput.parsedQuery)) return false;
        applySearchOutcome(
            searchInput,
            resolveSearchResults(searchInput.searchState, searchInput.parsedQuery),
            {
                scrollToTop: false
            }
        );
        return true;
    }

    return {
        search,
        refreshRecommendedDisplay,
        getSearchState,
        isRecommendedMode,
        areAllFormatsSelected: searchFiltersController.areAllFormatsSelected,
        areFormatsDefault: searchFiltersController.areFormatsDefault
    };
}
