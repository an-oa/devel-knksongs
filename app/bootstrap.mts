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
import { createSearchUiActions } from "./ui/core/search-actions.mjs";
import { createSidebarController } from "./ui/sidebar/ui.mjs";
import { createSearchFiltersController } from "./ui/search-filters/controller.mjs";
import { getSearchUiState } from "./lib/ui-slices.mjs";
import { debugPlayback } from "./lib/playback-debug.mjs";
import { createBrowserSongsDataSource } from "./ui/core/data-source.mjs";
import type {
    AppDataState,
    AppUiState,
    AppYoutubeRuntimeState
} from "./state.types";

const appDataState: AppDataState = appState.data;

/** @typedef {import("./state.types").AppUiState} AppUiState */
const appUiState: AppUiState = appState.ui;
const searchUiState = getSearchUiState(appUiState);
const youtubeRuntimeState: AppYoutubeRuntimeState = appState.youtube;

/**
 * 検索 controller から描画更新へ委譲する callback 群を作成する。
 * @param {{
 *   getRenderController: () => ReturnType<typeof createRenderController>,
 *   ui: AppUiState
 * }} input
 * @returns {{
 *   updateDisplay: () => void,
 *   scrollResultsPaneToTop: () => void
 * }}
 */
function createSearchCallbacks({ getRenderController, ui }) {
    return {
        updateDisplay: () => getRenderController().updateDisplay(),
        scrollResultsPaneToTop: () => scrollResultListToTop(ui.el.resultList)
    };
}

/**
 * 描画 controller から検索・YouTube・サイドバー・保存へ委譲する callback 群を作成する。
 * controller 生成順の循環を避けるため、後続 controller は呼び出し時に getter で解決する。
 * @param {{
 *   getSearchController: () => ReturnType<typeof createSearchController>,
 *   getYoutubeController: () => ReturnType<typeof createYoutubeController>,
 *   getSidebarController: () => ReturnType<typeof createSidebarController>,
 *   getStorageController: () => ReturnType<typeof createStorageController>
 * }} input
 */
function createRenderCallbacks({
    getSearchController,
    getYoutubeController,
    getSidebarController,
    getStorageController
}) {
    return {
        getSearchState: () => getSearchController().getSearchState(),
        isRecommendedMode: (state) => getSearchController().isRecommendedMode(state),
        updateThumbnail: (thumbDiv, yt) => getYoutubeController().updateThumbnail(thumbDiv, yt),
        extractYoutubeInfo,
        playThumbnail: (thumbDiv, yt, options) => getYoutubeController().playThumbnail(thumbDiv, yt, options),
        restoreActivePlayback: () => getYoutubeController().restoreActivePlayback(),
        openBookmarkModal: (songKey) => getSidebarController().openBookmarkModal(songKey),
        setupScrollObserver: () => getYoutubeController().setupScrollObserver(),
        removeSongFromActiveBookmark: (songKey) => getSidebarController().removeSongFromActiveBookmark(songKey),
        saveBookmarks: () => getStorageController().saveBookmarks()
    };
}

/**
 * storage controller から検索とブックマーク UI へ委譲する callback 群を作成する。
 * @param {{
 *   searchController: ReturnType<typeof createSearchController>,
 *   getBookmarkUiController: () => ReturnType<typeof createBookmarkUiController> | null
 * }} input
 * @returns {{
 *   getDateSelectValue: (kind: string) => string,
 *   applyPendingDateValues: () => void,
 *   renderBookmarks: () => void,
 *   scheduleSearch: (options?: { immediate?: boolean }) => void
 * }}
 */
function createStorageCallbacks({ searchController, getBookmarkUiController }) {
    return {
        getDateSelectValue: (kind) => searchController.getDateSelectValue(kind),
        applyPendingDateValues: () => searchController.applyPendingDateValues(),
        renderBookmarks: () => {
            const bookmarkUiController = getBookmarkUiController();
            if (bookmarkUiController) bookmarkUiController.renderBookmarks();
        },
        scheduleSearch: (options) => searchController.scheduleSearch(options)
    };
}

/**
 * ブックマーク UI controller から検索・保存・サイドバーへ委譲する callback 群を作成する。
 * @param {{
 *   searchController: ReturnType<typeof createSearchController>,
 *   storageController: ReturnType<typeof createStorageController>,
 *   getSidebarController: () => ReturnType<typeof createSidebarController> | null,
 *   clearSearchDebounce: () => void
 * }} input
 */
function createBookmarkUiCallbacks({
    searchController,
    storageController,
    getSidebarController,
    clearSearchDebounce
}) {
    return {
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
            const sidebarController = getSidebarController();
            if (sidebarController) sidebarController.closeSidebarMenu();
        }
    };
}

/**
 * サイドバー controller から各 controller へ委譲する callback 群を作成する。
 * @param {{
 *   getBookmarkUiController: () => ReturnType<typeof createBookmarkUiController> | null,
 *   youtubeController: ReturnType<typeof createYoutubeController>,
 *   searchController: ReturnType<typeof createSearchController>,
 *   renderController: ReturnType<typeof createRenderController>,
 *   markFilterTouched: (options?: { immediate?: boolean }) => void,
 *   markQueryTouched: () => void,
 *   resetDateSelectGroup: (kind: string) => void,
 *   clearSearch: () => void
 * }} input
 */
function createSidebarCallbacks({
    getBookmarkUiController,
    youtubeController,
    searchController,
    renderController,
    markFilterTouched,
    markQueryTouched,
    resetDateSelectGroup,
    clearSearch
}) {
    return {
        getBookmarkUiController,
        isIOSWebKit: () => youtubeController.isIOSWebKit(),
        markFilterTouched,
        markQueryTouched,
        clampDateInputsIfNeeded: () => searchController.clampDateInputsIfNeeded(),
        syncDateSelectOptions: (kind) => searchController.syncDateSelectOptions(kind),
        resetDateSelectGroup,
        updateDisplay: () => renderController.updateDisplay(),
        clearSearch
    };
}

/**
 * YouTube 再生イベントを描画更新と連続再生セッションへ接続する。
 * @param {{
 *   youtubeController: ReturnType<typeof createYoutubeController>,
 *   renderController: ReturnType<typeof createRenderController>,
 *   playbackSessionController: ReturnType<typeof createPlaybackSessionController>
 * }} input
 */
function wireYoutubePlaybackHooks({ youtubeController, renderController, playbackSessionController }) {
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
}

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
 *   searchUiActions: ReturnType<typeof createSearchUiActions>,
 *   dataLoader: ReturnType<typeof createDataLoader>
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
        callbacks: createSearchCallbacks({
            getRenderController: () => renderController,
            ui: appUiState
        })
    });

    /**
     * storageController と sidebarController は検索 UI 操作から遅延参照するため、生成後に代入する。
     */
    let storageController: ReturnType<typeof createStorageController>;
    let sidebarController: ReturnType<typeof createSidebarController>;

    const searchUiActions = createSearchUiActions({
        ui: appUiState,
        search: searchUiState,
        searchFiltersController,
        getSearchController: () => searchController,
        getStorageController: () => storageController,
        getSidebarController: () => sidebarController
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
        callbacks: createRenderCallbacks({
            getSearchController: () => searchController,
            getYoutubeController: () => youtubeController,
            getSidebarController: () => sidebarController,
            getStorageController: () => storageController
        })
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
     * localStorage 上の検索状態・ブックマーク保存データを読み書きする controller。
     * bookmark schema version の移行、インポート/エクスポート、保存後の再描画をまとめて扱う。
     */
    storageController = createStorageController({
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
        callbacks: createStorageCallbacks({
            searchController,
            getBookmarkUiController: () => bookmarkUiController
        })
    });

    /**
     * ブックマークパネルの表示、追加・削除・インポートなどのユーザー操作を扱う controller。
     * 永続化の実処理は storageController へ委譲する。
     */
    bookmarkUiController = createBookmarkUiController({
        data: appDataState,
        ui: appUiState,
        callbacks: createBookmarkUiCallbacks({
            searchController,
            storageController,
            getSidebarController: () => sidebarController,
            clearSearchDebounce: searchUiActions.clearSearchDebounce
        })
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
        callbacks: createSidebarCallbacks({
            getBookmarkUiController: () => bookmarkUiController,
            youtubeController,
            searchController,
            renderController,
            markFilterTouched: searchUiActions.markFilterTouched,
            markQueryTouched: searchUiActions.markQueryTouched,
            resetDateSelectGroup: searchUiActions.resetDateSelectGroup,
            clearSearch: searchUiActions.clearSearch
        })
    });

    /**
     * bfcache 復帰やフォーカス復帰時に、保存済み設定と検索 UI を再同期する controller。
     */
    const uiSyncController = createUiSyncController({
        uiSyncPasses: UI_SYNC_PASSES,
        syncSearchUI: searchUiActions.syncSearchUI,
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
            resetSearchConditions: searchUiActions.resetSearchConditions,
            scheduleSearch: (options) => searchController.scheduleSearch(options)
        }
    });

    wireYoutubePlaybackHooks({
        youtubeController,
        renderController,
        playbackSessionController
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
        searchUiActions,
        dataLoader
    };
}

const {
    searchFiltersController,
    renderController,
    playbackSettingsController,
    youtubeController,
    storageController,
    sidebarController,
    uiSyncController,
    searchUiActions,
    dataLoader
} = createAppControllers();

/**
 * DOM 参照の初期化と UI 各機能のセットアップを行う。
 */
async function initUI() {
    appUiState.el = collectUiElements();
    if (youtubeController.isIOSWebKit()) document.documentElement.classList.add("ios");

    searchFiltersController.setupFilterOptions({
        onFilterChange: searchUiActions.markFilterTouched
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
