import {
    RANDOM_DISPLAY_COUNT,
    MIN_PERFORMANCE_FOR_RANDOM,
    INCREMENT_COUNT,
    PUBLIC_CSV_URL,
    DEFAULT_FORMATS,
    CSV_CACHE_KEY,
    SEARCH_STATE_KEY,
    BOOKMARK_STORAGE_KEY,
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
} from "./state.mjs?v=4";
import { createSearchController } from "./search.mjs?v=4";
import { createRenderController } from "./render.mjs?v=4";
import { createYoutubeController, extractYoutubeInfo } from "./youtube.mjs?v=4";
import { createStorageController } from "./storage.mjs?v=4";
import { createBookmarkUiController } from "./bookmark-ui.mjs?v=4";
import { parseCsvToSongs } from "./csv-parser.mjs?v=4";

/**
 * @typedef {Object} SongRow
 * @property {string} date
 * @property {number | null} dateKey
 * @property {string} archiveId
 * @property {number | null} archiveOrder
 * @property {number} sourceIndex
 * @property {string} songKey
 * @property {string} legacySongKey
 * @property {string} format
 * @property {boolean} isRelay
 * @property {boolean} isHarmony
 * @property {string} title
 * @property {string} artist
 * @property {string} titleYomi
 * @property {string} artistYomi
 * @property {string} url
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
    }
});

const renderController = createRenderController({
    data,
    ui,
    isAllFormatsSelected: () => searchController.areAllFormatsSelected()
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
let closeSidebarMenu = null;

const storageController = createStorageController({
    data,
    ui,
    constants: {
        DEFAULT_FORMATS,
        SEARCH_STATE_KEY,
        BOOKMARK_STORAGE_KEY,
        MAX_BOOKMARK_COUNT,
        MAX_SONGS_PER_BOOKMARK
    },
    callbacks: {
        getDateSelectValue: (kind) => searchController.getDateSelectValue(kind),
        applyPendingDateValues: () => searchController.applyPendingDateValues(),
        renderBookmarks: () => {
            if (bookmarkUiController) bookmarkUiController.renderBookmarks();
        },
        scheduleSearch: (options) => scheduleSearch(options)
    }
});

bookmarkUiController = createBookmarkUiController({
    data,
    ui,
    callbacks: {
        clearSearchDebounce,
        scheduleSearch,
        onAddSongToBookmark: (bookmarkId, songKey) => storageController.addSongToBookmark(bookmarkId, songKey),
        onCreateBookmark: (bookmarkName) => storageController.createBookmark(bookmarkName),
        onCreateBookmarkAndAdd: (bookmarkName, songKey) => storageController.createBookmarkAndAdd(bookmarkName, songKey),
        onDeleteBookmark: (bookmarkId) => storageController.deleteBookmark(bookmarkId),
        onRenameBookmark: (bookmarkId, newName) => storageController.renameBookmark(bookmarkId, newName),
        onRemoveSongFromBookmark: (bookmarkId, songKey) => storageController.removeSongFromBookmark(bookmarkId, songKey),
        onRequestCloseSidebar: () => {
            if (typeof closeSidebarMenu === 'function') {
                closeSidebarMenu();
            }
        }
    }
});

renderController.setDependencies({
    getSearchState: () => searchController.getSearchState(),
    isRecommendedMode: (state) => searchController.isRecommendedMode(state),
    updateThumbnail: (thumbDiv, yt) => youtubeController.updateThumbnail(thumbDiv, yt),
    extractYoutubeInfo,
    restoreActivePlayback: () => youtubeController.restoreActivePlayback(),
    openBookmarkModal: (songKey) => openBookmarkModal(songKey),
    setupScrollObserver: () => youtubeController.setupScrollObserver(),
    removeSongFromActiveBookmark: (songKey) => removeSongFromActiveBookmark(songKey),
    saveBookmarks: () => storageController.saveBookmarks()
});
searchController.setRenderHooks({
    updateDisplay: () => renderController.updateDisplay(),
    scrollResultsPaneToTop
});
youtubeController.setDisplayHook(() => renderController.updateDisplay());

function scheduleSearch(options) { searchController.scheduleSearch(options); }
function getSearchState() { return searchController.getSearchState(); }
function isRecommendedMode(state) { return searchController.isRecommendedMode(state); }
function areAllFormatsSelected() { return searchController.areAllFormatsSelected(); }
function areFormatsDefault() { return searchController.areFormatsDefault(); }
function hasDateSelection() { return searchController.hasDateSelection(); }
function getDateSelectValue(kind) { return searchController.getDateSelectValue(kind); }
function applyDateSelectValue(kind, value) { searchController.applyDateSelectValue(kind, value); }
function resetDateSelects() { searchController.resetDateSelects(); }
function getPartialDateRange(kind) { return searchController.getPartialDateRange(kind); }
function syncDateSelectOptions(kind) { searchController.syncDateSelectOptions(kind); }
function applyPendingDateValues() { searchController.applyPendingDateValues(); }
function applyDateInputRange(songs) { return searchController.applyDateInputRange(songs); }
function clampDateInputsToBounds(minKey, maxKey) { searchController.clampDateInputsToBounds(minKey, maxKey); }
function clampDateInputsIfNeeded() { searchController.clampDateInputsIfNeeded(); }
function setupThumbnailToggle() { youtubeController.setupThumbnailToggle(); }
function applyThumbnailFromStorage() { youtubeController.applyThumbnailFromStorage(); }
function setupScrollObserver() { youtubeController.setupScrollObserver(); }
function isIOSWebKit() { return youtubeController.isIOSWebKit(); }
function updateDisplay() { renderController.updateDisplay(); }

function setSelectedFormatsToDefault() { storageController.setSelectedFormatsToDefault(); }
function syncFormatCheckboxesFromState() { storageController.syncFormatCheckboxesFromState(); }
function loadBookmarks() { storageController.loadBookmarks(); }
function migrateLegacyBookmarkSongRefs() { storageController.migrateLegacyBookmarkSongRefs(); }
function saveSearchState() { storageController.saveSearchState(); }
function restoreSearchState() { storageController.restoreSearchState(); }

// ===== Lifecycle (public) =====

/**
 * DOM参照の初期化とUI各機能のセットアップを行う。
 */
async function initUI() {
    const sidebar = document.getElementById('sidebar');
    ui.el = {
        sidebar,
        sidebarHeader: sidebar ? sidebar.querySelector('.sidebar-header') : null,
        sidebarScrollArea: sidebar ? sidebar.querySelector('.sidebar-scroll-area') : null,
        resultList: document.getElementById('resultList'),
        resultCount: document.getElementById('resultCount'),
        loadMoreContainer: document.getElementById('loadMoreContainer'),
        searchBox: document.getElementById('searchBox'),
        relayOnly: document.getElementById('relayOnly'),
        harmonyOnly: document.getElementById('harmonyOnly'),
        dateFromYear: document.getElementById('dateFromYear'),
        dateFromMonth: document.getElementById('dateFromMonth'),
        dateFromDay: document.getElementById('dateFromDay'),
        dateToYear: document.getElementById('dateToYear'),
        dateToMonth: document.getElementById('dateToMonth'),
        dateToDay: document.getElementById('dateToDay'),
        clearDateFromBtn: document.getElementById('clearDateFromBtn'),
        clearDateToBtn: document.getElementById('clearDateToBtn'),
        themeToggle: document.getElementById('theme-toggle'),
        thumbToggle: document.getElementById('thumbnail-toggle'),
        formatsList: document.getElementById('formatsList'),
        openBookmarkPanelBtn: document.getElementById('open-bookmark-panel'),
        bookmarkSidebarPanel: document.getElementById('bookmark-sidebar-panel'),
        closeBookmarkPanelBtn: document.getElementById('close-bookmark-panel'),
        closeBookmarkSidebarBtn: document.getElementById('close-bookmark-sidebar'),
        bookmarkPanelCreate: document.getElementById('bookmark-panel-create'),
        bookmarkPanelNewName: document.getElementById('bookmark-panel-new-name'),
        bookmarkPanelError: document.getElementById('bookmark-panel-error'),
        bookmarkPanelCreateBtn: document.getElementById('bookmark-panel-create-btn'),
        bookmarkList: document.getElementById('bookmark-list'),
    };
    if (isIOSWebKit()) document.documentElement.classList.add('ios');

    setupUIHandlers();
    initFilterMenu();
    loadBookmarks();
    setupTheme();
    setupThumbnailToggle();
    setupScrollObserver();
    setupSyncEvents();
    window.addEventListener('resize', () => {
        setupScrollObserver();
        renderController.refreshLayout();
    });
    restoreSearchState();
    await loadInitialData();
}

/**
 * アプリ起動時に初期化処理を開始する。
 */
function boot() {
    initUI().catch((err) => {
        console.error("initUI failed", err);
    });
}

document.addEventListener('DOMContentLoaded', boot);

// ===== Lifecycle (private) =====

/**
 * フォーカス復帰時のUI同期を行う。
 */
function handleFocusSync() {
    scheduleSyncUiState();
}

/**
 * ページ再表示時にUI同期を行う。
 */
function handleVisibilitySync() {
    if (document.visibilityState !== "visible") return;
    scheduleSyncUiState();
}

/**
 * pageshow時に同期と遅延ビジュアル同期を行う。
 */
function handlePageShowSync() {
    scheduleSyncUiState();
    scheduleDelayedVisualSync();
}

/**
 * フォーカス・表示状態・pageshowの同期イベントを登録する。
 */
function setupSyncEvents() {
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener("pageshow", handlePageShowSync);
}

// ===== UI Controls (public) =====

/**
 * 検索UI・サイドバー・日付入力・各種ボタンのイベントを設定する。
 */
function setupUIHandlers() {
    const sidebar = ui.el.sidebar;
    const openBtn = document.getElementById('open-sidebar');
    const closeBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const clearBtn = document.getElementById('clearBtn');
    const dateFromYear = ui.el.dateFromYear;
    const dateFromMonth = ui.el.dateFromMonth;
    const dateFromDay = ui.el.dateFromDay;
    const dateToYear = ui.el.dateToYear;
    const dateToMonth = ui.el.dateToMonth;
    const dateToDay = ui.el.dateToDay;
    let lastFocusedElement = null;

    openBtn.addEventListener('click', () => {
        bookmarkUiController.closeBookmarkModal({ restoreFocus: false });
        sidebar.classList.add('active');
        overlay.classList.add('show');
        sidebar.setAttribute('aria-hidden', 'false');
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        focusSidebarFirst();
    });

    const closeMenu = () => {
        bookmarkUiController.closeBookmarkModal({ restoreFocus: false });
        blurSidebarActiveElement(sidebar);
        sidebar.classList.remove('active');
        overlay.classList.remove('show');
        sidebar.setAttribute('aria-hidden', 'true');
        if (lastFocusedElement) {
            lastFocusedElement.focus();
        } else {
            openBtn.focus();
        }
    };
    closeSidebarMenu = closeMenu;

    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
    ui.el.openBookmarkPanelBtn.addEventListener('click', () => {
        bookmarkUiController.openBookmarkBrowser({
            returnFocusEl: ui.el.openBookmarkPanelBtn
        });
    });
    ui.el.closeBookmarkPanelBtn.addEventListener('click', () => {
        bookmarkUiController.closeBookmarkModal({ restoreFocus: true });
    });
    ui.el.closeBookmarkSidebarBtn.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            if (ui.el.bookmarkSidebarPanel && !ui.el.bookmarkSidebarPanel.hidden) {
                e.preventDefault();
                bookmarkUiController.closeBookmarkModal({ restoreFocus: true });
                return;
            }
            closeMenu();
        }
        if (e.key === "Tab") trapSidebarFocus(e, sidebar);
    });

    ui.el.relayOnly.addEventListener('change', () => {
        markFilterTouched();
    });
    ui.el.harmonyOnly.addEventListener('change', () => {
        markFilterTouched();
    });
    ui.el.searchBox.addEventListener('input', () => {
        markQueryTouched();
    });

    [dateFromYear, dateFromMonth, dateFromDay, dateToYear, dateToMonth, dateToDay].forEach((el) => {
        if (!el) return;
        el.addEventListener('change', () => {
            const isIOS = isIOSWebKit();
            const group = el.closest('.date-select-group');
            const isYearChange = el === dateFromYear || el === dateToYear;
            const isMonthChange = el === dateFromMonth || el === dateToMonth;
            if (isIOS && group && isYearChange) {
                group.classList.add('is-updating');
                const month = el === dateFromYear ? ui.el.dateFromMonth : ui.el.dateToMonth;
                const day = el === dateFromYear ? ui.el.dateFromDay : ui.el.dateToDay;
                if (month) month.value = "";
                if (day) day.value = "";
            } else if (isIOS && group && isMonthChange) {
                group.classList.add('is-updating');
                const day = el === dateFromMonth ? ui.el.dateFromDay : ui.el.dateToDay;
                if (day) day.value = "";
            } else {
                moveDateFocusIfNeeded(el, dateFromYear, dateFromMonth, dateToYear, dateToMonth);
            }
            markFilterTouched({ immediate: true });
            clampDateInputsIfNeeded();
            syncDateSelectOptions();
            if (isIOS && group && (isYearChange || isMonthChange)) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        group.classList.remove('is-updating');
                    });
                });
            }
        });
        el.addEventListener('blur', clampDateInputsIfNeeded);
    });

    [ui.el.clearDateFromBtn, ui.el.clearDateToBtn].forEach((btn, idx) => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            resetDateSelectGroup(idx === 0 ? "from" : "to");
            markFilterTouched({ immediate: true });
        });
    });

    loadMoreBtn.addEventListener('click', () => {
        data.displayLimit += INCREMENT_COUNT;
        updateDisplay();
    });

    clearBtn.addEventListener('click', clearSearch);
    setupBookmarkHandlers();
}

/**
 * 指定側の日付セレクトをクリアして候補を同期する。
 * @param {*} kind
 */
function resetDateSelectGroup(kind) {
    const isFrom = kind === "from";
    const year = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
    const month = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
    const day = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
    if (year) year.value = "";
    if (month) month.value = "";
    if (day) day.value = "";
    syncDateSelectOptions();
}

// ===== Bookmark =====

/**
 * ブックマークUIハンドラーの初期化を委譲する。
 */
function setupBookmarkHandlers() {
    bookmarkUiController.setupBookmarkHandlers();
}

/**
 * 曲追加用のブックマークモーダル表示を委譲する。
 * @param {*} songKey
 */
function openBookmarkModal(songKey) {
    const sidebar = ui.el.sidebar;
    const openBtn = document.getElementById('open-sidebar');
    const returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const sidebarWasActive = sidebar.classList.contains('active');
    if (!sidebarWasActive) {
        openBtn.click();
    }
    bookmarkUiController.openBookmarkModal(songKey, {
        returnFocusEl,
        closeSidebarOnExit: !sidebarWasActive
    });
}

/**
 * アクティブブックマークからの曲削除を委譲する。
 * @param {*} songKey
 */
function removeSongFromActiveBookmark(songKey) {
    bookmarkUiController.removeSongFromActiveBookmark(songKey);
}

/**
 * アクティブブックマーク解除処理を委譲する。
 * @param {*} options
 */
function clearActiveBookmark(options) {
    bookmarkUiController.clearActiveBookmark(options);
}

// ===== Sidebar Accessibility =====

/**
 * 日付入力時に次のセレクトへフォーカス移動する。
 * @param {*} target
 * @param {*} fromYear
 * @param {*} fromMonth
 * @param {*} toYear
 * @param {*} toMonth
 */
function moveDateFocusIfNeeded(target, fromYear, fromMonth, toYear, toMonth) {
    if (fromYear && target === fromYear && fromMonth && fromYear.value) {
        fromMonth.focus();
        return;
    }
    if (fromMonth && target === fromMonth && fromMonth.value) {
        const fromDay = ui.el.dateFromDay;
        if (fromDay) {
            fromDay.focus();
            return;
        }
    }
    if (toYear && target === toYear && toMonth && toYear.value) {
        toMonth.focus();
        return;
    }
    if (toMonth && target === toMonth && toMonth.value) {
        const toDay = ui.el.dateToDay;
        if (toDay) {
            toDay.focus();
        }
    }
}

/**
 * サイドバー内の現在フォーカス要素を外す。
 * @param {*} sidebar
 */
function blurSidebarActiveElement(sidebar) {
    const active = document.activeElement;
    if (!sidebar || !(active instanceof HTMLElement)) return;
    if (!sidebar.contains(active)) return;
    if (typeof active.blur === "function") {
        active.blur();
    }
}

/**
 * サイドバー内でフォーカス可能な要素一覧を取得する。
 * @param {*} sidebar
 */
function getFocusableInSidebar(sidebar) {
    if (!sidebar) return [];
    const focusable = sidebar.querySelectorAll([
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(','));
    return Array.from(focusable).filter((el) => {
        if (el.hasAttribute('inert') || el.hidden) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

/**
 * サイドバー内の先頭フォーカス可能要素へフォーカスする。
 */
function focusSidebarFirst() {
    const sidebar = document.getElementById('sidebar');
    const focusable = getFocusableInSidebar(sidebar);
    if (focusable.length > 0) {
        focusable[0].focus();
    } else if (sidebar) {
        sidebar.setAttribute('tabindex', '-1');
        sidebar.focus();
    }
}

/**
 * 開いているサイドバー内でTabフォーカスを循環させる。
 * @param {*} event
 * @param {*} sidebar
 */
function trapSidebarFocus(event, sidebar) {
    if (!sidebar || !sidebar.classList.contains('active')) return;
    const focusable = getFocusableInSidebar(sidebar);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
    }
    if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

/**
 * 検索条件とアクティブブックマークをリセットして保存する。
 */
function clearSearch() {
    clearActiveBookmark({ skipSearch: true });
    resetSearchConditions(true);
    saveSearchState();
}

/**
 * テーマ状態を初期化し、トグル変更を保存する。
 */
function setupTheme() {
    const themeToggle = ui.el.themeToggle;
    applyThemeFromStorage();
    if (!themeToggle) return;
    themeToggle.addEventListener('change', () => {
        const isDarkNow = themeToggle.checked;
        document.documentElement.classList.toggle('dark-theme', isDarkNow);
        localStorage.setItem('theme', isDarkNow ? 'dark' : 'light');
    });
}

/**
 * 結果リストのスクロール位置を先頭へ戻す。
 */
function scrollResultsPaneToTop() {
    const resultList = ui.el.resultList;
    if (!resultList) return;

    const scrollContainer = findScrollableAncestor(resultList);
    if (!scrollContainer) return;

    if (scrollContainer === document.body || scrollContainer === document.documentElement) {
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
    }
    scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
}

/**
 * 指定要素を含む最も近いスクロール可能祖先を探す。
 * @param {*} element
 */
function findScrollableAncestor(element) {
    let current = element.parentElement;
    while (current) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight;
        if (isScrollable) return current;
        current = current.parentElement;
    }
    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

// ===== UI Controls (private) =====

/**
 * フィルタ操作済みフラグを立てて検索・保存を行う。
 * @param {*} options
 */
function markFilterTouched(options) {
    ui.userTouchedFilters = true;
    scheduleSearch(options);
    saveSearchState();
}

/**
 * 検索語操作済みフラグを立てて検索・保存を行う。
 */
function markQueryTouched() {
    ui.userTouchedQuery = true;
    scheduleSearch();
    saveSearchState();
}

/**
 * 保留中の検索デバウンスタイマーを解除する。
 */
function clearSearchDebounce() {
    if (ui.searchDebounceId) {
        clearTimeout(ui.searchDebounceId);
        ui.searchDebounceId = 0;
    }
}

/**
 * 検索語入力を初期化する。
 */
function resetSearchQuery() {
    if (ui.el.searchBox) ui.el.searchBox.value = "";
    ui.userTouchedQuery = false;
}

/**
 * フィルタ条件を既定状態へ戻す。
 */
function resetSearchFilters() {
    const relayOnly = ui.el.relayOnly;
    const harmonyOnly = ui.el.harmonyOnly;

    if (relayOnly) relayOnly.checked = false;
    if (harmonyOnly) harmonyOnly.checked = false;
    resetDateSelects();
    ui.pendingDateValues = null;

    setSelectedFormatsToDefault();
    syncFormatCheckboxesFromState();
    ui.userTouchedFilters = false;
}

/**
 * 検索語とフィルタをまとめて初期化し必要なら再検索する。
 * @param {*} shouldSearch
 */
function resetSearchConditions(shouldSearch) {
    clearSearchDebounce();
    resetSearchQuery();
    resetSearchFilters();
    if (shouldSearch && ui.dataReady) scheduleSearch({ immediate: true });
}

// ===== UI Sync (public) =====

/**
 * オプションに応じてUIの見た目と検索状態を同期する。
 * @param {*} options
 */
function syncUiState(options) {
    const opts = options || {};
    const shouldSyncVisual = opts.visual !== false;
    const shouldSyncSearch = opts.search !== false;
    if (shouldSyncVisual) syncVisualUI();
    if (shouldSyncSearch) syncSearchUI();
}

/**
 * UI同期を実行し、必要に応じて次フレームでも再同期する。
 * @param {*} options
 */
function scheduleSyncUiState(options) {
    syncUiState(options);
    if (UI_SYNC_PASSES < 2) return;
    requestAnimationFrame(() => syncUiState(options));
}

/**
 * 遅延付きで見た目のみのUI同期を予約する。
 * @param {*} delayMs
 */
function scheduleDelayedVisualSync(delayMs) {
    const delay = Number.isFinite(delayMs) ? delayMs : 200;
    setTimeout(() => scheduleSyncUiState({ visual: true, search: false }), delay);
}

// ===== UI Sync (private) =====

/**
 * テーマとサムネイル表示のUI状態を同期する。
 */
function syncVisualUI() {
    syncThemeUI();
    syncThumbnailUI();
}

/**
 * テーマ表示を保存状態に同期する。
 */
function syncThemeUI() {
    applyThemeFromStorage();
}

/**
 * サムネイル表示設定を保存状態に同期する。
 */
function syncThumbnailUI() {
    applyThumbnailFromStorage();
}

/**
 * 保存値またはシステム設定からテーマを適用する。
 */
function applyThemeFromStorage() {
    const themeToggle = ui.el.themeToggle;
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDarkMode = savedTheme ? (savedTheme === 'dark') : systemPrefersDark;
    document.documentElement.classList.toggle('dark-theme', isDarkMode);
    if (themeToggle) themeToggle.checked = isDarkMode;
}

// ===== Search Sync / Filters (private) =====

/**
 * フィルタが既定状態から外れているか判定する。
 */
function needsFilterReset() {
    const relayOnly = ui.el.relayOnly;
    const harmonyOnly = ui.el.harmonyOnly;
    if (relayOnly && relayOnly.checked) return true;
    if (harmonyOnly && harmonyOnly.checked) return true;
    if (hasDateSelection()) return true;
    return !areFormatsDefault();
}

/**
 * 未操作時に検索語の不整合があればリセットする。
 */
function syncSearchQueryIfNeeded() {
    if (ui.userTouchedQuery) return false;
    const searchBox = ui.el.searchBox;
    if (!searchBox || searchBox.value === "") return false;
    resetSearchQuery();
    return true;
}

/**
 * 未操作時にフィルタの不整合があればリセットする。
 */
function syncSearchFiltersIfNeeded() {
    syncFormatCheckboxesFromState();
    if (ui.userTouchedFilters) return false;
    if (!needsFilterReset()) return false;
    resetSearchFilters();
    return true;
}

/**
 * 検索語/フィルタ同期の結果に応じて再検索する。
 */
function syncSearchUI() {
    const shouldSearch = syncSearchQueryIfNeeded() || syncSearchFiltersIfNeeded();
    if (shouldSearch && ui.dataReady) scheduleSearch({ immediate: true });
}

// ===== Data Loading / Parsing (public) =====

/**
 * CSVを取得（失敗時はキャッシュ利用）して初期データを適用する。
 */
async function loadInitialData() {
    const resCount = ui.el.resultCount;
    try {
        resCount.innerText = "データを読み込み中...";
        const res = await fetch(PUBLIC_CSV_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const csvText = await res.text();
        localStorage.setItem(CSV_CACHE_KEY, csvText);
        applyLoadedCsv(csvText, null);
    } catch (e) {
        const cached = localStorage.getItem(CSV_CACHE_KEY);
        if (cached) {
            applyLoadedCsv(cached, "キャッシュを表示中");
        } else {
            resCount.innerText = "読込エラー";
        }
    }
}

// ===== Data Loading / Parsing (private) =====

/**
 * フォーマットフィルタのチェックボックスUIを構築する。
 */
function initFilterMenu() {
    const container = ui.el.formatsList;
    if (!container || container.childElementCount > 0) return;
    if (ui.selectedFormats.size === 0) setSelectedFormatsToDefault();
    DEFAULT_FORMATS.forEach((fmt) => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = fmt;
        cb.addEventListener('change', (e) => {
            ui.userTouchedFilters = true;
            if (e.target.checked) ui.selectedFormats.add(e.target.value);
            else ui.selectedFormats.delete(e.target.value);
            scheduleSearch();
            saveSearchState();
        });
        label.append(cb, ` ${fmt}`);
        container.appendChild(label);
    });
    syncFormatCheckboxesFromState();
}

/**
 * 読み込んだCSVを解析して状態更新と初回検索を行う。
 * @param {*} csvText
 * @param {*} statusLabel
 */
function applyLoadedCsv(csvText, statusLabel) {
    data.allSongsRaw = parseCsvToSongs(csvText);
    migrateLegacyBookmarkSongRefs();
    ui.recommendedCache = null;
    const dateBounds = applyDateInputRange(data.allSongsRaw);
    if (dateBounds) {
        clampDateInputsToBounds(dateBounds.minKey, dateBounds.maxKey);
    }
    ui.el.searchBox.disabled = false;
    ui.dataReady = true;
    if (statusLabel) {
        ui.el.resultCount.innerText = statusLabel;
    }
    if (!ui.hasRestoredSearchState) {
        resetSearchConditions(false);
    }
    scheduleSearch({ immediate: true });
}
