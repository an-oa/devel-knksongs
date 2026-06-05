// @ts-check

import { createDateFilterController } from "../ui/date/filter.mjs";
import { filterSongsByCriteria } from "../lib/search-filters.mjs";
import { pickRecommendedSongs } from "../lib/search-recommendation.mjs";
import {
    collectSearchBooleanFilterState,
    hasSelectedSearchBooleanFilterState
} from "../lib/search-boolean-filters.mjs";
import { getLookupUiState, getSearchUiState } from "../lib/ui-slices.mjs";

/**
 * 検索条件の収集・結果解決・推薦選曲を管理するコントローラーを作成する。
 * @param {SearchControllerInput} input
 */
export function createSearchController({ data, ui, searchFiltersController, constants, callbacks }) {
    const {
        RANDOM_DISPLAY_COUNT,
        MIN_PERFORMANCE_FOR_RANDOM,
        RESULT_DISPLAY_BATCH_SIZE,
        SEARCH_DEBOUNCE_MS
    } = constants;
    const searchUi = /** @type {SearchUiRuntimeState} */ (getSearchUiState(ui));
    const lookupUi = /** @type {LookupUiRuntimeState} */ (getLookupUiState(ui));
    const dateFilterController = createDateFilterController({ ui });
    const updateDisplay = callbacks.updateDisplay;
    const scrollResultsPaneToTop = callbacks.scrollResultsPaneToTop;

    /**
     * デバウンス付きで検索実行を予約し、必要時は即時実行する。
     * @param {{ immediate?: boolean }} [options]
     */
    function scheduleSearch(options) {
        if (searchUi.debounceId) clearTimeout(searchUi.debounceId);
        if (options && options.immediate) {
            search();
            return;
        }
        searchUi.debounceId = setTimeout(() => {
            searchUi.debounceId = 0;
            search();
        }, SEARCH_DEBOUNCE_MS);
    }

    /**
     * 検索入力の収集から結果反映までの処理を行う。
     */
    function search() {
        const searchInput = collectSearchInput();
        const outcome = resolveSearchOutcome(searchInput.searchState);
        applySearchOutcome(searchInput, outcome);
    }

    /**
     * 検索実行に必要な入力情報を収集する。
     * @returns {SearchInput}
     */
    function collectSearchInput() {
        return {
            searchState: getSearchState(),
            resultCountEl: ui.el.resultCount
        };
    }

    /**
     * 検索状態から表示用の結果セットを導出する。
     * @param {SearchState} searchState
     * @returns {SearchOutcome}
     */
    function resolveSearchOutcome(searchState) {
        return resolveSearchResults(searchState);
    }

    /**
     * 検索結果を state と UI へ反映する。
     * @param {SearchInput} searchInput
     * @param {SearchOutcome} outcome
     */
    function applySearchOutcome(searchInput, outcome) {
        data.currentResults = outcome.results;
        data.displayLimit = outcome.displayLimit;
        if (searchInput.resultCountEl) searchInput.resultCountEl.innerText = outcome.label;
        updateDisplay();
        scrollResultsPaneToTop();
    }

    /**
     * 現在の UI 入力から検索条件オブジェクトを生成する。
     * @returns {SearchState}
     */
    function getSearchState() {
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
    function isRecommendedMode(searchState) {
        return !data.activeBookmark &&
            searchState.queryRaw === "" &&
            !hasSelectedSearchBooleanFilterState(searchState) &&
            !searchState.hasDateFilter &&
            searchFiltersController.areAllFormatsSelected();
    }

    /**
     * ブックマーク内の参照 ID を曲データ配列へ解決する。
     * @param {BookmarkRecord} bookmark
     * @returns {Song[]}
     */
    function resolveBookmarkRows(bookmark) {
        ensureSongLookupMaps();
        const songs = Array.isArray(bookmark.songs) ? bookmark.songs : [];
        /** @type {Song[]} */
        const resolvedSongs = [];
        for (const songRef of songs) {
            const song = typeof songRef === "string"
                ? lookupUi.songMapByBookmarkKey.get(songRef) || lookupUi.songMapByKey.get(songRef)
                : Number.isFinite(songRef) ? lookupUi.songMapByLegacyIndex.get(songRef) : null;
            if (song) resolvedSongs.push(song);
        }
        return resolvedSongs;
    }

    /**
     * 曲参照用の検索マップを必要時に再構築する。
     */
    function ensureSongLookupMaps() {
        if (lookupUi.songLookupSourceRef === data.allSongsRaw &&
            lookupUi.songMapByBookmarkKey instanceof Map &&
            lookupUi.songMapByKey instanceof Map &&
            lookupUi.songMapByLegacyIndex instanceof Map) {
            return;
        }
        lookupUi.songMapByBookmarkKey = new Map();
        lookupUi.songMapByKey = new Map(data.allSongsRaw.map((row) => [row.songKey, row]));
        data.allSongsRaw.forEach((row) => {
            if (typeof row.bookmarkSongKey === "string" && row.bookmarkSongKey) {
                lookupUi.songMapByBookmarkKey.set(row.bookmarkSongKey, row);
            }
        });
        lookupUi.songMapByLegacyIndex = new Map(data.allSongsRaw.map((row) => [row.sourceIndex, row]));
        lookupUi.songLookupSourceRef = data.allSongsRaw;
    }

    /**
     * 通常検索・ブックマーク検索・おすすめ表示を切り替えて結果を作る。
     * @param {SearchState} searchState
     * @returns {SearchOutcome}
     */
    function resolveSearchResults(searchState) {
        if (data.activeBookmark) {
            const bookmark = data.bookmarks[data.activeBookmark];
            if (bookmark) {
                const bookmarkRows = resolveBookmarkRows(bookmark);
                const results = filterSongsByCriteria(bookmarkRows, searchState, searchUi.selectedFormats);
                return buildIncrementalSearchOutcome(
                    results,
                    `ブックマーク: ${bookmark.name} (${results.length} 件)`
                );
            }
        }

        if (isRecommendedMode(searchState)) {
            return {
                results: pickRecommended(),
                displayLimit: RANDOM_DISPLAY_COUNT,
                label: "おすすめを表示中"
            };
        }

        const results = filterSongs(searchState);
        return buildIncrementalSearchOutcome(results, `${results.length} 件がヒット`);
    }

    /**
     * 段階表示用の件数上限を含む検索結果オブジェクトを作る。
     * @param {Song[]} results
     * @param {string} label
     * @returns {SearchOutcome}
     */
    function buildIncrementalSearchOutcome(results, label) {
        return {
            results,
            displayLimit: Math.min(results.length, RESULT_DISPLAY_BATCH_SIZE),
            label
        };
    }

    /**
     * 全曲データを現在の検索条件で絞り込む。
     * @param {SearchState} searchState
     * @returns {Song[]}
     */
    function filterSongs(searchState) {
        return filterSongsByCriteria(data.allSongsRaw, searchState, searchUi.selectedFormats);
    }

    /**
     * おすすめ曲をキャッシュ付きで選定して返す。
     * @returns {Song[]}
     */
    function pickRecommended() {
        if (searchUi.recommendedCache) return searchUi.recommendedCache;
        searchUi.recommendedCache = pickRecommendedSongs(data.allSongsRaw, {
            count: RANDOM_DISPLAY_COUNT,
            minPerformanceCount: MIN_PERFORMANCE_FOR_RANDOM
        });
        return searchUi.recommendedCache;
    }

    return {
        scheduleSearch,
        search,
        getSearchState,
        isRecommendedMode,
        areAllFormatsSelected: searchFiltersController.areAllFormatsSelected,
        areFormatsDefault: searchFiltersController.areFormatsDefault,
        hasDateSelection: dateFilterController.hasDateSelection,
        getDateSelectValue: dateFilterController.getDateSelectValue,
        applyDateSelectValue: dateFilterController.applyDateSelectValue,
        resetDateSelects: dateFilterController.resetDateSelects,
        getPartialDateRange: dateFilterController.getPartialDateRange,
        syncDateSelectOptions: dateFilterController.syncDateSelectOptions,
        applyPendingDateValues: dateFilterController.applyPendingDateValues,
        applyDateInputRange: dateFilterController.applyDateInputRange,
        clampDateInputsToBounds: dateFilterController.clampDateInputsToBounds,
        clampDateInputsIfNeeded: dateFilterController.clampDateInputsIfNeeded
    };
}
