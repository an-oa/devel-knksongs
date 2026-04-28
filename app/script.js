import {
    RANDOM_DISPLAY_COUNT,
    MIN_PERFORMANCE_FOR_RANDOM,
    INCREMENT_COUNT,
    PUBLIC_SONGS_JSON_URL,
    PUBLIC_SONGS_META_URL,
    PUBLIC_CSV_URL,
    DEFAULT_FORMATS,
    SONGS_JSON_CACHE_KEY,
    CSV_CACHE_KEY,
    SEARCH_STATE_KEY,
    BOOKMARK_STORAGE_KEY,
    BOOKMARK_STORAGE_VERSION,
    MAX_BOOKMARK_COUNT,
    MAX_SONGS_PER_BOOKMARK,
    UI_SYNC_PASSES,
    SEARCH_DEBOUNCE_MS,
    YT_IFRAME_API_SRC,
    YT_IFRAME_API_SELECTOR,
    YT_IFRAME_READY_POLL_MS,
    STOP_PLAYBACK_ON_SCROLL_OUT,
    data,
    ui,
    youtube
} from "./state.mjs?v=13";
import { createSearchController } from "./controllers/search.mjs?v=13";
import { createRenderController } from "./controllers/render.mjs?v=13";
import { createPlaybackSessionController } from "./controllers/playback-session.mjs?v=13";
import { createPlaybackSettingsController } from "./controllers/playback-settings.mjs?v=13";
import { createYoutubeController, extractYoutubeInfo } from "./controllers/youtube.mjs?v=13";
import { createStorageController } from "./controllers/storage.mjs?v=13";
import { createBookmarkUiController } from "./ui/bookmark/ui.mjs?v=13";
import { scrollResultListToTop } from "./lib/results-scroll.mjs?v=13";
import { getFormatFilterLabel } from "./lib/format-filter.mjs?v=13";
import {
    collectUiElements,
    applyThemeFromStorage,
    setupTheme,
    initFilterMenu
} from "./ui/core/elements.mjs?v=13";
import { createUiSyncController } from "./ui/core/sync.mjs?v=13";
import { createDataLoader } from "./ui/core/data.mjs?v=13";
import { createSidebarController } from "./ui/sidebar/ui.mjs?v=13";
import { getDateUiState, getSearchUiState } from "./lib/ui-slices.mjs?v=13";
import { debugPlayback } from "./lib/playback-debug.mjs?v=13";

/**
 * @typedef {Object} SongRow
 * @property {string} date
 * @property {number | null} dateKey
 * @property {string} archiveId
 * @property {number | null} archiveOrder
 * @property {number} sourceIndex
 * @property {string} videoId
 * @property {string} songKey
 * @property {string} bookmarkSongKey
 * @property {string} legacySongKey
 * @property {string} format
 * @property {string} videoOrientation
 * @property {boolean} isRelay
 * @property {boolean} isHarmony
 * @property {string} title
 * @property {string} artist
 * @property {string} titleYomi
 * @property {string} artistYomi
 * @property {string} url
 * @property {number | null} endSeconds
 * @property {string} titleNorm
 * @property {string} artistNorm
 * @property {string} titleYomiNorm
 * @property {string} artistYomiNorm
 */

const searchController = createSearchController({
    data,
    ui,
    constants: {
        RANDOM_DISPLAY_COUNT,
        MIN_PERFORMANCE_FOR_RANDOM,
        INCREMENT_COUNT,
        SEARCH_DEBOUNCE_MS,
        DEFAULT_FORMATS
    },
    callbacks: {
        updateDisplay: () => renderController.updateDisplay(),
        scrollResultsPaneToTop: () => scrollResultListToTop(ui.el.resultList)
    }
});

const renderController = createRenderController({
    data,
    ui,
    isAllFormatsSelected: () => searchController.areAllFormatsSelected(),
    incrementCount: INCREMENT_COUNT,
    callbacks: {
        getSearchState: () => searchController.getSearchState(),
        isRecommendedMode: (state) => searchController.isRecommendedMode(state),
        updateThumbnail: (thumbDiv, yt) => youtubeController.updateThumbnail(thumbDiv, yt),
        extractYoutubeInfo,
        playThumbnail: (thumbDiv, yt, options) => youtubeController.playThumbnail(thumbDiv, yt, options),
        restoreActivePlayback: () => youtubeController.restoreActivePlayback(),
        openBookmarkModal: (songKey) => sidebarController.openBookmarkModal(songKey),
        setupScrollObserver: () => youtubeController.setupScrollObserver(),
        removeSongFromActiveBookmark: (songKey) => sidebarController.removeSongFromActiveBookmark(songKey),
        saveBookmarks: () => storageController.saveBookmarks()
    }
});

const playbackSessionController = createPlaybackSessionController({
    data,
    ui,
    callbacks: {
        playSongByKey: (songKey) => renderController.playSongByKey(songKey),
        scrollSongIntoView: (songKey) => renderController.scrollSongIntoView(songKey)
    }
});

const playbackSettingsController = createPlaybackSettingsController({
    ui,
    callbacks: {
        ensureThumbnailPlaybackReady: () => youtubeController.ensureThumbnailPlaybackReady(),
        restoreActivePlayback: () => youtubeController.restoreActivePlayback(),
        updateDisplay: () => renderController.updateDisplay(),
        setupScrollObserver: () => youtubeController.setupScrollObserver()
    }
});

const youtubeController = createYoutubeController({
    ui,
    youtube,
    constants: {
        YT_IFRAME_API_SRC,
        YT_IFRAME_API_SELECTOR,
        YT_IFRAME_READY_POLL_MS,
        STOP_PLAYBACK_ON_SCROLL_OUT
    }
});

let bookmarkUiController = null;
let sidebarController = null;
const searchUi = getSearchUiState(ui);
const dateUi = getDateUiState(ui);

const storageController = createStorageController({
    data,
    ui,
    constants: {
        DEFAULT_FORMATS,
        SEARCH_STATE_KEY,
        BOOKMARK_STORAGE_KEY,
        BOOKMARK_STORAGE_VERSION,
        MAX_BOOKMARK_COUNT,
        MAX_SONGS_PER_BOOKMARK
    },
    callbacks: {
        getDateSelectValue: (kind) => searchController.getDateSelectValue(kind),
        applyPendingDateValues: () => searchController.applyPendingDateValues(),
        renderBookmarks: () => {
            if (bookmarkUiController) bookmarkUiController.renderBookmarks();
        },
        scheduleSearch: (options) => searchController.scheduleSearch(options)
    }
});

bookmarkUiController = createBookmarkUiController({
    data,
    ui,
    callbacks: {
        clearSearchDebounce,
        scheduleSearch: (options) => searchController.scheduleSearch(options),
        onAddSongToBookmark: (bookmarkId, songKey) => storageController.addSongToBookmark(bookmarkId, songKey),
        onCreateBookmark: (bookmarkName) => storageController.createBookmark(bookmarkName),
        onCreateBookmarkAndAdd: (bookmarkName, songKey) => storageController.createBookmarkAndAdd(bookmarkName, songKey),
        onDeleteBookmark: (bookmarkId) => storageController.deleteBookmark(bookmarkId),
        onRenameBookmark: (bookmarkId, newName) => storageController.renameBookmark(bookmarkId, newName),
        onRemoveSongFromBookmark: (bookmarkId, songKey) => storageController.removeSongFromBookmark(bookmarkId, songKey),
        onRequestCloseSidebar: () => {
            if (sidebarController) {
                sidebarController.closeSidebarMenu();
            }
        }
    }
});

sidebarController = createSidebarController({
    data,
    ui,
    constants: {
        incrementCount: INCREMENT_COUNT
    },
    callbacks: {
        getBookmarkUiController: () => bookmarkUiController,
        isIOSWebKit: () => youtubeController.isIOSWebKit(),
        markFilterTouched,
        markQueryTouched,
        clampDateInputsIfNeeded: () => searchController.clampDateInputsIfNeeded(),
        syncDateSelectOptions: (kind) => searchController.syncDateSelectOptions(kind),
        resetDateSelectGroup,
        updateDisplay: () => renderController.updateDisplay(),
        clearSearch
    }
});

const uiSyncController = createUiSyncController({
    uiSyncPasses: UI_SYNC_PASSES,
    syncSearchUI,
    applyThemeFromStorage: () => applyThemeFromStorage({ ui }),
    applyPlaybackSettingsFromStorage: () => playbackSettingsController.applyPlaybackSettingsFromStorage()
});

const dataLoader = createDataLoader({
    data,
    ui,
    publicSongsJsonUrl: PUBLIC_SONGS_JSON_URL,
    publicSongsMetaUrl: PUBLIC_SONGS_META_URL,
    publicCsvUrl: PUBLIC_CSV_URL,
    songsJsonCacheKey: SONGS_JSON_CACHE_KEY,
    csvCacheKey: CSV_CACHE_KEY,
    callbacks: {
        migrateLegacyBookmarkSongRefs: () => storageController.migrateLegacyBookmarkSongRefs(),
        applyDateInputRange: (songs) => searchController.applyDateInputRange(songs),
        clampDateInputsToBounds: (minKey, maxKey) => searchController.clampDateInputsToBounds(minKey, maxKey),
        resetSearchConditions,
        scheduleSearch: (options) => searchController.scheduleSearch(options)
    }
});

youtubeController.setLayoutHook(() => renderController.refreshLayout());
youtubeController.setPlaybackEndedHook(({ songKey }) => {
    debugPlayback("script", "continuePlayback requested from playback ended", {
        songKey
    });
    playbackSessionController.continuePlayback(songKey);
});
youtubeController.setPlaybackStartFailedHook(({ songKey, playbackMode, wasPlaybackStartUnconfirmed }) => {
    debugPlayback("script", "playback start failed hook received", {
        songKey,
        playbackMode,
        wasPlaybackStartUnconfirmed: Boolean(wasPlaybackStartUnconfirmed)
    });
    if (playbackMode !== "manual" && !wasPlaybackStartUnconfirmed) return;
    debugPlayback("script", wasPlaybackStartUnconfirmed
        ? "continuePlayback requested from unconfirmed playback start failure"
        : "continuePlayback requested from manual playback start failure", {
        songKey
    });
    playbackSessionController.continuePlayback(songKey);
});

/**
 * DOM 参照の初期化と UI 各機能のセットアップを行う。
 */
async function initUI() {
    ui.el = collectUiElements();
    if (youtubeController.isIOSWebKit()) document.documentElement.classList.add("ios");

    sidebarController.setupUIHandlers();
    initFilterMenu({
        ui,
        defaultFormats: DEFAULT_FORMATS,
        getFormatFilterLabel,
        setSelectedFormatsToDefault: () => storageController.setSelectedFormatsToDefault(),
        syncFormatCheckboxesFromState: () => storageController.syncFormatCheckboxesFromState(),
        scheduleSearch: (options) => searchController.scheduleSearch(options),
        saveSearchState: () => storageController.saveSearchState()
    });
    storageController.loadBookmarks();
    setupTheme({ ui });
    playbackSettingsController.setupPlaybackSettings();
    youtubeController.setupScrollObserver();
    uiSyncController.setupSyncEvents();
    window.addEventListener("resize", () => {
        youtubeController.setupScrollObserver();
        renderController.refreshLayout();
    });
    storageController.restoreSearchState();
    await dataLoader.loadInitialData();
}

/**
 * アプリ起動時に初期化処理を開始する。
 */
function boot() {
    initUI().catch((error) => {
        console.error("initUI failed", error);
    });
}

document.addEventListener("DOMContentLoaded", boot);

/**
 * 指定側の日付セレクトをクリアして候補を同期する。
 * @param {string} kind
 */
function resetDateSelectGroup(kind) {
    const isFrom = kind === "from";
    const year = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
    const month = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
    const day = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
    if (year) year.value = "";
    if (month) month.value = "";
    if (day) day.value = "";
    searchController.syncDateSelectOptions();
}

/**
 * 検索条件とアクティブブックマークをリセットして保存する。
 */
function clearSearch() {
    sidebarController.clearActiveBookmark({ skipSearch: true });
    resetSearchConditions(true);
    storageController.saveSearchState();
}

/**
 * フィルタ操作済みフラグを立てて検索・保存を行う。
 * @param {{ immediate?: boolean } | undefined} options
 */
function markFilterTouched(options) {
    searchUi.userTouchedFilters = true;
    searchController.scheduleSearch(options);
    storageController.saveSearchState();
}

/**
 * 検索語操作済みフラグを立てて検索・保存を行う。
 */
function markQueryTouched() {
    searchUi.userTouchedQuery = true;
    searchController.scheduleSearch();
    storageController.saveSearchState();
}

/**
 * 保留中の検索デバウンスタイマーを解除する。
 */
function clearSearchDebounce() {
    if (searchUi.debounceId) {
        clearTimeout(searchUi.debounceId);
        searchUi.debounceId = 0;
    }
}

/**
 * 検索語入力を初期化する。
 */
function resetSearchQuery() {
    if (ui.el.searchBox) ui.el.searchBox.value = "";
    searchUi.userTouchedQuery = false;
}

/**
 * フィルタ条件を既定状態へ戻す。
 */
function resetSearchFilters() {
    const relayOnly = ui.el.relayOnly;
    const harmonyOnly = ui.el.harmonyOnly;

    if (relayOnly) relayOnly.checked = false;
    if (harmonyOnly) harmonyOnly.checked = false;
    searchController.resetDateSelects();
    dateUi.pendingValues = null;

    storageController.setSelectedFormatsToDefault();
    storageController.syncFormatCheckboxesFromState();
    searchUi.userTouchedFilters = false;
}

/**
 * 検索語とフィルタをまとめて初期化し必要なら再検索する。
 * @param {boolean} shouldSearch
 */
function resetSearchConditions(shouldSearch) {
    clearSearchDebounce();
    resetSearchQuery();
    resetSearchFilters();
    if (shouldSearch && searchUi.dataReady) {
        searchController.scheduleSearch({ immediate: true });
    }
}

/**
 * フィルタが既定状態から外れているか判定する。
 * @returns {boolean}
 */
function needsFilterReset() {
    const relayOnly = ui.el.relayOnly;
    const harmonyOnly = ui.el.harmonyOnly;
    if (relayOnly && relayOnly.checked) return true;
    if (harmonyOnly && harmonyOnly.checked) return true;
    if (searchController.hasDateSelection()) return true;
    return !searchController.areFormatsDefault();
}

/**
 * 未操作時に検索語の不整合があればリセットする。
 * @returns {boolean}
 */
function syncSearchQueryIfNeeded() {
    if (searchUi.userTouchedQuery) return false;
    const searchBox = ui.el.searchBox;
    if (!searchBox || searchBox.value === "") return false;
    resetSearchQuery();
    return true;
}

/**
 * 未操作時にフィルタの不整合があればリセットする。
 * @returns {boolean}
 */
function syncSearchFiltersIfNeeded() {
    storageController.syncFormatCheckboxesFromState();
    if (searchUi.userTouchedFilters) return false;
    if (!needsFilterReset()) return false;
    resetSearchFilters();
    return true;
}

/**
 * 検索語・フィルタ同期の結果に応じて再検索する。
 */
function syncSearchUI() {
    const shouldSearch = syncSearchQueryIfNeeded() || syncSearchFiltersIfNeeded();
    if (shouldSearch && searchUi.dataReady) {
        searchController.scheduleSearch({ immediate: true });
    }
}
