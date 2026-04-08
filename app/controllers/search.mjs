import { createDateFilterController } from "../ui/date/filter.mjs?v=9";
import {
    dateKeyToParts,
    filterSongsByCriteria,
    isWithinDateRange,
    normalizeForSearch,
    parseDateKey
} from "../lib/search-filters.mjs?v=9";
import { pickRecommendedSongs } from "../lib/search-recommendation.mjs?v=9";
import { getLookupUiState, getSearchUiState } from "../lib/ui-slices.mjs?v=9";

export {
    dateKeyToParts,
    filterSongsByCriteria,
    isWithinDateRange,
    normalizeForSearch,
    parseDateKey
};

/**
 * 検索条件の収集・結果解決・推薦選曲を管理するコントローラーを作成する。
 * @param {*} ui
 */
export function createSearchController({ data, ui, constants }) {
    const {
        RANDOM_DISPLAY_COUNT,
        MIN_PERFORMANCE_FOR_RANDOM,
        INCREMENT_COUNT,
        SEARCH_DEBOUNCE_MS,
        DEFAULT_FORMATS
    } = constants;
    const searchUi = getSearchUiState(ui);
    const lookupUi = getLookupUiState(ui);
    const dateFilterController = createDateFilterController({ ui });
    let updateDisplay = () => {};
    let scrollResultsPaneToTop = () => {};

    /**
     * 検索後に呼び出す描画フックを登録する。
     * @param {*} hooks
     */
    function setRenderHooks(hooks) {
        if (hooks && typeof hooks.updateDisplay === "function") {
            updateDisplay = hooks.updateDisplay;
        }
        if (hooks && typeof hooks.scrollResultsPaneToTop === "function") {
            scrollResultsPaneToTop = hooks.scrollResultsPaneToTop;
        }
    }

    /**
     * デバウンス付きで検索実行を予約し、必要時は即時実行する。
     * @param {*} options
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
     */
    function collectSearchInput() {
        return {
            searchState: getSearchState(),
            resultCountEl: ui.el.resultCount
        };
    }

    /**
     * 検索状態から表示用の結果セットを導出する。
     * @param {*} searchState
     */
    function resolveSearchOutcome(searchState) {
        return resolveSearchResults(searchState);
    }

    /**
     * 検索結果を state と UI へ反映する。
     * @param {*} searchInput
     * @param {*} outcome
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
     */
    function getSearchState() {
        const fromRange = dateFilterController.getPartialDateRange("from");
        const toRange = dateFilterController.getPartialDateRange("to");
        return {
            queryRaw: ui.el.searchBox.value.trim(),
            relayOnly: ui.el.relayOnly.checked,
            harmonyOnly: ui.el.harmonyOnly.checked,
            dateFromKey: fromRange ? fromRange.minKey : null,
            dateToKey: toRange ? toRange.maxKey : null,
            hasDateFilter: Boolean(fromRange || toRange)
        };
    }

    /**
     * 既定フォーマットがすべて選択されているか判定する。
     */
    function areAllFormatsSelected() {
        return DEFAULT_FORMATS.every((f) => searchUi.selectedFormats.has(f));
    }

    /**
     * フォーマット選択が既定状態と一致するか判定する。
     */
    function areFormatsDefault() {
        if (searchUi.selectedFormats.size !== DEFAULT_FORMATS.length) return false;
        return areAllFormatsSelected();
    }

    /**
     * 条件未指定時のおすすめ表示モードかどうかを判定する。
     * @param {*} searchState
     */
    function isRecommendedMode(searchState) {
        return !data.activeBookmark &&
            searchState.queryRaw === "" &&
            !searchState.relayOnly &&
            !searchState.harmonyOnly &&
            !searchState.hasDateFilter &&
            areAllFormatsSelected();
    }

    /**
     * ブックマーク内の参照 ID を曲データ配列へ解決する。
     * @param {*} bookmark
     */
    function resolveBookmarkRows(bookmark) {
        ensureSongLookupMaps();
        const songs = Array.isArray(bookmark.songs) ? bookmark.songs : [];
        return songs
            .map((songRef) => {
                if (typeof songRef === "string") return lookupUi.songMapByKey.get(songRef);
                if (Number.isFinite(songRef)) return lookupUi.songMapByLegacyIndex.get(songRef);
                return null;
            })
            .filter(Boolean);
    }

    /**
     * 曲参照用の検索マップを必要時に再構築する。
     */
    function ensureSongLookupMaps() {
        if (lookupUi.songLookupSourceRef === data.allSongsRaw &&
            lookupUi.songMapByKey instanceof Map &&
            lookupUi.songMapByLegacyIndex instanceof Map) {
            return;
        }
        lookupUi.songMapByKey = new Map(data.allSongsRaw.map((row) => [row.songKey, row]));
        lookupUi.songMapByLegacyIndex = new Map(data.allSongsRaw.map((row) => [row.sourceIndex, row]));
        lookupUi.songLookupSourceRef = data.allSongsRaw;
    }

    /**
     * 通常検索・ブックマーク検索・おすすめ表示を切り替えて結果を作る。
     * @param {*} searchState
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
     * @param {*} results
     * @param {*} label
     */
    function buildIncrementalSearchOutcome(results, label) {
        return {
            results,
            displayLimit: Math.min(results.length, INCREMENT_COUNT),
            label
        };
    }

    /**
     * 全曲データを現在の検索条件で絞り込む。
     * @param {*} searchState
     */
    function filterSongs(searchState) {
        return filterSongsByCriteria(data.allSongsRaw, searchState, searchUi.selectedFormats);
    }

    /**
     * おすすめ曲をキャッシュ付きで選定して返す。
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
        setRenderHooks,
        scheduleSearch,
        search,
        getSearchState,
        isRecommendedMode,
        areAllFormatsSelected,
        areFormatsDefault,
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
