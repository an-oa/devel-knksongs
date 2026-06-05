import {
    RANDOM_DISPLAY_COUNT,
    MIN_PERFORMANCE_FOR_RANDOM,
    RESULT_DISPLAY_BATCH_SIZE,
    DEFAULT_FORMATS,
    SEARCH_STATE_KEY,
    BOOKMARK_STORAGE_KEY,
    BOOKMARK_STORAGE_VERSION,
    MAX_BOOKMARK_COUNT,
    MAX_SONGS_PER_BOOKMARK,
    MAX_BOOKMARK_NAME_LENGTH,
    UI_SYNC_PASSES,
    SEARCH_DEBOUNCE_MS,
    YT_IFRAME_API_SRC,
    YT_IFRAME_API_SELECTOR,
    YT_IFRAME_READY_POLL_MS,
    STOP_PLAYBACK_ON_SCROLL_OUT,
    appState
} from "./state.mjs";
import {
    PUBLIC_SONGS_JSON_URL,
    PUBLIC_SONGS_META_URL,
    PUBLIC_CSV_URL,
    SONGS_JSON_CACHE_KEY,
    LEGACY_CSV_CACHE_KEY,
    CSV_CACHE_KEY
} from "./config.mjs";
import { createSearchController } from "./controllers/search.mjs";
import { createRenderController } from "./controllers/render.mjs";
import { createPlaybackSessionController } from "./controllers/playback-session.mjs";
import { createPlaybackSettingsController } from "./controllers/playback-settings.mjs";
import { createYoutubeController, extractYoutubeInfo } from "./controllers/youtube.mjs";
import { createStorageController } from "./controllers/storage.mjs";
import { createBookmarkUiController } from "./ui/bookmark/ui.mjs";
import { scrollResultListToTop } from "./lib/results-scroll.mjs";
import {
    collectUiElements,
    applyThemeFromStorage,
    setupTheme
} from "./ui/core/elements.mjs";
import { createUiSyncController } from "./ui/core/sync.mjs";
import { createDataLoader } from "./ui/core/data.mjs";
import { createSidebarController } from "./ui/sidebar/ui.mjs";
import { createSearchFiltersController } from "./ui/search-filters/controller.mjs";
import { getSearchUiState } from "./lib/ui-slices.mjs";
import { debugPlayback } from "./lib/playback-debug.mjs";
import { createBrowserSongsDataSource } from "./ui/core/data-source.mjs";

/**
 * アプリ全体で共有する曲データ・検索結果・ブックマークの状態ストア。
 * 各 controller はこの参照を通して検索結果やアクティブブックマークを更新する。
 * @type {AppDataState}
 */
const appDataState = appState.data;

/**
 * DOM 要素キャッシュと UI ランタイム状態をまとめた状態ストア。
 * 検索入力、日付範囲、再生設定、派生 lookup map など画面操作に必要な状態を保持する。
 * @type {AppUiState}
 */
const appUiState = appState.ui;

/**
 * YouTube IFrame API と共有プレーヤーのランタイム状態ストア。
 * API 読み込み Promise やカード間で再利用するプレーヤー状態を controller 間で共有する。
 * @type {AppYoutubeRuntimeState}
 */
const youtubeRuntimeState = appState.youtube;

/**
 * アプリ controller 群を作成し、相互 callback を同じ composition 境界内で配線する。
 * @returns {{
 *   searchFiltersController: ReturnType<typeof createSearchFiltersController>,
 *   searchController: ReturnType<typeof createSearchController>,
 *   renderController: ReturnType<typeof createRenderController>,
 *   playbackSettingsController: ReturnType<typeof createPlaybackSettingsController>,
 *   youtubeController: ReturnType<typeof createYoutubeController>,
 *   storageController: ReturnType<typeof createStorageController>,
 *   sidebarController: ReturnType<typeof createSidebarController>,
 *   uiSyncController: ReturnType<typeof createUiSyncController>,
 *   dataLoader: ReturnType<typeof createDataLoader>,
 *   searchUi: SearchUiRuntimeState
 * }}
 */
function createAppControllers() {
    /**
     * 形式フィルタの選択状態を appUiState.search.selectedFormats と同期する controller。
     * DEFAULT_FORMATS を基準に、検索条件の収集・復元・リセットから参照される。
     */
    const searchFiltersController = createSearchFiltersController({
        ui: appUiState,
        defaultFormats: DEFAULT_FORMATS
    });

    /**
     * 検索 UI から条件を読み取り、表示対象の曲配列を appDataState.currentResults へ反映する controller。
     * 描画更新は renderController へ委譲し、結果リストのスクロール位置もここで揃える。
     */
    const searchController = createSearchController({
        data: appDataState,
        ui: appUiState,
        searchFiltersController,
        constants: {
            RANDOM_DISPLAY_COUNT,
            MIN_PERFORMANCE_FOR_RANDOM,
            RESULT_DISPLAY_BATCH_SIZE,
            SEARCH_DEBOUNCE_MS,
            DEFAULT_FORMATS
        },
        callbacks: {
            updateDisplay: () => renderController.updateDisplay(),
            scrollResultsPaneToTop: () => scrollResultListToTop(appUiState.el.resultList)
        }
    });

    /**
     * appDataState.currentResults を DOM の検索結果カードへ反映する controller。
     * サムネイル再生、ブックマーク操作、カード再利用用キャッシュとの接続点もここに集約する。
     */
    const renderController = createRenderController({
        data: appDataState,
        ui: appUiState,
        isAllFormatsSelected: () => searchController.areAllFormatsSelected(),
        resultDisplayBatchSize: RESULT_DISPLAY_BATCH_SIZE,
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

    /**
     * 現在の検索結果と再生設定をもとに、連続再生や次曲送りのセッションを管理する controller。
     */
    const playbackSessionController = createPlaybackSessionController({
        data: appDataState,
        ui: appUiState,
        callbacks: {
            playSongByKey: (songKey) => renderController.playSongByKey(songKey),
            scrollSongIntoView: (songKey) => renderController.scrollSongIntoView(songKey)
        }
    });

    /**
     * サムネイル表示や連続再生など、再生設定 UI と保存値の同期を扱う controller。
     */
    const playbackSettingsController = createPlaybackSettingsController({
        ui: appUiState,
        callbacks: {
            ensureThumbnailPlaybackReady: () => youtubeController.ensureThumbnailPlaybackReady(),
            restoreActivePlayback: () => youtubeController.restoreActivePlayback(),
            updateDisplay: () => renderController.updateDisplay(),
            setupScrollObserver: () => youtubeController.setupScrollObserver()
        }
    });

    /**
     * YouTube IFrame API の読み込み、サムネイル埋め込み、共有プレーヤー状態を扱う controller。
     */
    const youtubeController = createYoutubeController({
        ui: appUiState,
        youtube: youtubeRuntimeState,
        constants: {
            YT_IFRAME_API_SRC,
            YT_IFRAME_API_SELECTOR,
            YT_IFRAME_READY_POLL_MS,
            STOP_PLAYBACK_ON_SCROLL_OUT
        }
    });

    /**
     * ブックマークパネル UI controller の遅延参照。
     * storageController と sidebarController の callbacks から相互参照するため、生成後に代入する。
     * @type {ReturnType<typeof createBookmarkUiController> | null}
     */
    let bookmarkUiController = null;

    /**
     * サイドバー UI controller の遅延参照。
     * ブックマーク UI と検索リセット callback が互いに参照し合うため、生成後に代入する。
     * @type {ReturnType<typeof createSidebarController> | null}
     */
    let sidebarController = null;

    /**
     * 検索 UI slice への短い参照。
     * 入力済みフラグやデバウンスタイマーなど、検索フォームのランタイム状態だけを扱う。
     * @type {SearchUiRuntimeState}
     */
    const searchUi = getSearchUiState(appUiState);

    /**
     * localStorage 上の検索状態・ブックマーク保存データを読み書きする controller。
     * bookmark schema version の移行、インポート/エクスポート、保存後の再描画をまとめて扱う。
     */
    const storageController = createStorageController({
        data: appDataState,
        ui: appUiState,
        searchFiltersController,
        constants: {
            SEARCH_STATE_KEY,
            DEFAULT_FORMATS,
            BOOKMARK_STORAGE_KEY,
            BOOKMARK_STORAGE_VERSION,
            MAX_BOOKMARK_COUNT,
            MAX_SONGS_PER_BOOKMARK,
            MAX_BOOKMARK_NAME_LENGTH
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

    /**
     * ブックマークパネルの表示、追加・削除・インポートなどのユーザー操作を扱う controller。
     * 永続化の実処理は storageController へ委譲する。
     */
    bookmarkUiController = createBookmarkUiController({
        data: appDataState,
        ui: appUiState,
        callbacks: {
            clearSearchDebounce,
            scheduleSearch: (options) => searchController.scheduleSearch(options),
            onAddSongToBookmark: (bookmarkId, songKey) => storageController.addSongToBookmark(bookmarkId, songKey),
            onCreateBookmark: (bookmarkName) => storageController.createBookmark(bookmarkName),
            onCreateBookmarkAndAdd: (bookmarkName, songKey) => storageController.createBookmarkAndAdd(bookmarkName, songKey),
            onDeleteBookmark: (bookmarkId) => storageController.deleteBookmark(bookmarkId),
            onRenameBookmark: (bookmarkId, newName) => storageController.renameBookmark(bookmarkId, newName),
            onRemoveSongFromBookmark: (bookmarkId, songKey) => storageController.removeSongFromBookmark(bookmarkId, songKey),
            onExportBookmarks: () => storageController.exportBookmarksAsJsonText(),
            onPreviewBookmarkImport: (text) => storageController.parseBookmarkImportText(text),
            onImportBookmarksText: (text) => storageController.importBookmarksFromJsonText(text),
            onRequestCloseSidebar: () => {
                if (sidebarController) {
                    sidebarController.closeSidebarMenu();
                }
            }
        }
    });

    /**
     * サイドバー全体の開閉、設定パネル、ブックマークパネル、検索リセット導線を扱う controller。
     */
    sidebarController = createSidebarController({
        data: appDataState,
        ui: appUiState,
        constants: {
            resultDisplayBatchSize: RESULT_DISPLAY_BATCH_SIZE
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

    /**
     * bfcache 復帰やフォーカス復帰時に、保存済み設定と検索 UI を再同期する controller。
     */
    const uiSyncController = createUiSyncController({
        uiSyncPasses: UI_SYNC_PASSES,
        syncSearchUI,
        applyThemeFromStorage: () => applyThemeFromStorage({ ui: appUiState }),
        applyPlaybackSettingsFromStorage: () => playbackSettingsController.applyPlaybackSettingsFromStorage()
    });

    /**
     * 曲データの取得元を束ねる data source。
     * 公開 JSON と meta による鮮度確認を優先し、失敗時は CSV と保存済みキャッシュへ fallback する。
     */
    const songsDataSource = createBrowserSongsDataSource({
        publicSongsJsonUrl: PUBLIC_SONGS_JSON_URL,
        publicSongsMetaUrl: PUBLIC_SONGS_META_URL,
        publicCsvUrl: PUBLIC_CSV_URL,
        songsJsonCacheKey: SONGS_JSON_CACHE_KEY,
        csvCacheKey: CSV_CACHE_KEY,
        legacyCsvCacheKey: LEGACY_CSV_CACHE_KEY
    });

    /**
     * 初期曲データの読み込み結果を appDataState へ反映し、日付範囲・検索条件・表示を初期化する loader。
     */
    const dataLoader = createDataLoader({
        data: appDataState,
        ui: appUiState,
        dataSource: songsDataSource,
        callbacks: {
            migrateLegacyBookmarkSongRefs: () => storageController.migrateLegacyBookmarkSongRefs(),
            applyDateInputRange: (songs) => searchController.applyDateInputRange(songs),
            clampDateInputsToBounds: (minKey, maxKey) => searchController.clampDateInputsToBounds(minKey, maxKey),
            resetSearchConditions,
            scheduleSearch: (options) => searchController.scheduleSearch(options)
        }
    });

    /**
     * YouTube 再生イベントを描画更新と連続再生セッションへ接続する。
     */
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

    return {
        searchFiltersController,
        searchController,
        renderController,
        playbackSettingsController,
        youtubeController,
        storageController,
        sidebarController,
        uiSyncController,
        dataLoader,
        searchUi
    };
}

const {
    searchFiltersController,
    searchController,
    renderController,
    playbackSettingsController,
    youtubeController,
    storageController,
    sidebarController,
    uiSyncController,
    dataLoader,
    searchUi
} = createAppControllers();

/**
 * DOM 参照の初期化と UI 各機能のセットアップを行う。
 */
async function initUI() {
    appUiState.el = collectUiElements();
    if (youtubeController.isIOSWebKit()) document.documentElement.classList.add("ios");

    searchFiltersController.setupFilterOptions({
        onFilterChange: markFilterTouched
    });
    sidebarController.setupUIHandlers();
    storageController.loadBookmarks();
    setupTheme({ ui: appUiState });
    playbackSettingsController.setupPlaybackSettings();
    exposePlaybackSettingsConsoleApi();
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
    initUI().catch(reportInitError);
}

/**
 * 初期化失敗時のエラーを記録する。
 * @param {unknown} error
 */
function reportInitError(error) {
    console.error("initUI failed", error);
}

document.addEventListener("DOMContentLoaded", boot);

/**
 * Inspect の console から隠し再生設定をページ内だけで操作できる API を公開する。
 */
function exposePlaybackSettingsConsoleApi() {
    window.knkPlaybackSettings = playbackSettingsController.createConsoleApi();
}

/**
 * 指定側の日付セレクトをクリアして候補を同期する。
 * @param {string} kind
 */
function resetDateSelectGroup(kind) {
    const isFrom = kind === "from";
    const year = isFrom ? appUiState.el.dateFromYear : appUiState.el.dateToYear;
    const month = isFrom ? appUiState.el.dateFromMonth : appUiState.el.dateToMonth;
    const day = isFrom ? appUiState.el.dateFromDay : appUiState.el.dateToDay;
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
 * @param {Event | { immediate?: boolean }} [options]
 */
function markFilterTouched(options) {
    searchUi.userTouchedFilters = true;
    const scheduleOptions = options && "immediate" in options ? options : undefined;
    searchController.scheduleSearch(scheduleOptions);
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
    if (appUiState.el.searchBox) appUiState.el.searchBox.value = "";
    searchUi.userTouchedQuery = false;
}

/**
 * フィルタ条件を既定状態へ戻す。
 */
function resetSearchFilters() {
    searchFiltersController.resetFiltersToDefault({
        resetDateSelects: () => searchController.resetDateSelects()
    });
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
 * 未操作時に検索語の不整合があればリセットする。
 * @returns {boolean}
 */
function syncSearchQueryIfNeeded() {
    if (searchUi.userTouchedQuery) return false;
    const searchBox = appUiState.el.searchBox;
    if (!searchBox || searchBox.value === "") return false;
    resetSearchQuery();
    return true;
}

/**
 * 未操作時にフィルタの不整合があればリセットする。
 * @returns {boolean}
 */
function syncSearchFiltersIfNeeded() {
    searchFiltersController.syncFormatCheckboxesFromState();
    if (searchUi.userTouchedFilters) return false;
    if (!searchFiltersController.needsFilterReset({
        hasDateSelection: () => searchController.hasDateSelection()
    })) {
        return false;
    }
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
