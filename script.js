import {
    RANDOM_DISPLAY_COUNT,
    MIN_PERFORMANCE_FOR_RANDOM,
    INCREMENT_COUNT,
    PUBLIC_CSV_URL,
    DEFAULT_FORMATS,
    CSV_CACHE_KEY,
    SEARCH_STATE_KEY,
    BOOKMARK_STORAGE_KEY,
    UI_SYNC_PASSES,
    SEARCH_DEBOUNCE_MS,
    YT_IFRAME_API_SRC,
    YT_IFRAME_API_SELECTOR,
    YT_IFRAME_READY_POLL_MS,
    STOP_PLAYBACK_ON_SCROLL_OUT,
    data,
    ui,
    youtube
} from "./state.mjs?v=3";
import { createSearchController } from "./search.mjs?v=3";
import { createRenderController } from "./render.mjs?v=3";
import { createYoutubeController, extractYoutubeInfo } from "./youtube.mjs?v=3";
import { createStorageController } from "./storage.mjs?v=3";
import { createBookmarkUiController } from "./bookmark-ui.mjs?v=3";
import { parseCsvToSongs } from "./csv-parser.mjs?v=3";

/**
 * @typedef {Object} SongRow
 * @property {string} date
 * @property {number | null} dateKey
 * @property {string} archiveId
 * @property {number | null} archiveOrder
 * @property {number} sourceIndex
 * @property {string} songKey
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

const storageController = createStorageController({
    data,
    ui,
    constants: {
        DEFAULT_FORMATS,
        SEARCH_STATE_KEY,
        BOOKMARK_STORAGE_KEY
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
        onCreateBookmarkAndAdd: (bookmarkName, songKey) => storageController.createBookmarkAndAdd(bookmarkName, songKey),
        onDeleteBookmark: (bookmarkId) => storageController.deleteBookmark(bookmarkId),
        onRemoveSongFromBookmark: (bookmarkId, songKey) => storageController.removeSongFromBookmark(bookmarkId, songKey)
    }
});

renderController.setDependencies({
    getSearchState: () => searchController.getSearchState(),
    isRecommendedMode: (state) => searchController.isRecommendedMode(state),
    updateThumbnail: (thumbDiv, yt) => youtubeController.updateThumbnail(thumbDiv, yt),
    extractYoutubeInfo,
    openBookmarkModal: (songKey) => openBookmarkModal(songKey),
    setupScrollObserver: () => youtubeController.setupScrollObserver(),
    removeSongFromActiveBookmark: (songKey) => removeSongFromActiveBookmark(songKey)
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
 * initUI を実行する
 */
async function initUI() {
    ui.el = {
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
        bookmarkList: document.getElementById('bookmark-list'),
        bookmarkModal: document.getElementById('bookmark-modal'),
        bookmarkModalClose: document.getElementById('bookmark-modal-close'),
        bookmarkModalList: document.getElementById('bookmark-modal-list'),
        bookmarkModalNewName: document.getElementById('bookmark-modal-new-name'),
        bookmarkModalCreateBtn: document.getElementById('bookmark-modal-create-btn')
    };
    if (isIOSWebKit()) document.documentElement.classList.add('ios');

    setupUIHandlers();
    initFilterMenu();
    loadBookmarks();
    setupTheme();
    setupThumbnailToggle();
    setupScrollObserver();
    setupSyncEvents();
    window.addEventListener('resize', setupScrollObserver);
    restoreSearchState();
    await loadInitialData();
}

/**
 * boot を実行する
 */
function boot() {
    initUI().catch((err) => {
        console.error("initUI failed", err);
    });
}

document.addEventListener('DOMContentLoaded', boot);

// ===== Lifecycle (private) =====

/**
 * handleFocusSync を実行する
 */
function handleFocusSync() {
    scheduleSyncUiState();
}

/**
 * handleVisibilitySync を実行する
 */
function handleVisibilitySync() {
    if (document.visibilityState !== "visible") return;
    scheduleSyncUiState();
}

/**
 * handlePageShowSync を実行する
 */
function handlePageShowSync() {
    scheduleSyncUiState();
    scheduleDelayedVisualSync();
}

/**
 * setupSyncEvents を実行する
 */
function setupSyncEvents() {
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener("pageshow", handlePageShowSync);
}

// ===== UI Controls (public) =====

/**
 * setupUIHandlers を実行する
 */
function setupUIHandlers() {
    const sidebar = document.getElementById('sidebar');
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
        sidebar.classList.add('active');
        overlay.classList.add('show');
        sidebar.setAttribute('aria-hidden', 'false');
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        focusSidebarFirst();
    });

    const closeMenu = () => {
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

    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") closeMenu();
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
 * resetDateSelectGroup を実行する
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
 * setupBookmarkHandlers を実行する
 */
function setupBookmarkHandlers() {
    bookmarkUiController.setupBookmarkHandlers();
}

/**
 * openBookmarkModal を実行する
 * @param {*} songKey
 */
function openBookmarkModal(songKey) {
    bookmarkUiController.openBookmarkModal(songKey);
}

/**
 * removeSongFromActiveBookmark を実行する
 * @param {*} songKey
 */
function removeSongFromActiveBookmark(songKey) {
    bookmarkUiController.removeSongFromActiveBookmark(songKey);
}

/**
 * clearActiveBookmark を実行する
 * @param {*} options
 */
function clearActiveBookmark(options) {
    bookmarkUiController.clearActiveBookmark(options);
}

// ===== Sidebar Accessibility =====

/**
 * moveDateFocusIfNeeded を実行する
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
 * blurSidebarActiveElement を実行する
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
 * getFocusableInSidebar を実行する
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
    return Array.from(focusable).filter((el) => !el.hasAttribute('inert'));
}

/**
 * focusSidebarFirst を実行する
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
 * trapSidebarFocus を実行する
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
 * clearSearch を実行する
 */
function clearSearch() {
    clearActiveBookmark({ skipSearch: true });
    resetSearchConditions(true);
    saveSearchState();
}

/**
 * setupTheme を実行する
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
 * scrollResultsPaneToTop を実行する
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
 * findScrollableAncestor を実行する
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
 * markFilterTouched を実行する
 * @param {*} options
 */
function markFilterTouched(options) {
    ui.userTouchedFilters = true;
    scheduleSearch(options);
    saveSearchState();
}

/**
 * markQueryTouched を実行する
 */
function markQueryTouched() {
    ui.userTouchedQuery = true;
    scheduleSearch();
    saveSearchState();
}

/**
 * clearSearchDebounce を実行する
 */
function clearSearchDebounce() {
    if (ui.searchDebounceId) {
        clearTimeout(ui.searchDebounceId);
        ui.searchDebounceId = 0;
    }
}

/**
 * resetSearchQuery を実行する
 */
function resetSearchQuery() {
    if (ui.el.searchBox) ui.el.searchBox.value = "";
    ui.userTouchedQuery = false;
}

/**
 * resetSearchFilters を実行する
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
 * resetSearchConditions を実行する
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
 * syncUiState を実行する
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
 * scheduleSyncUiState を実行する
 * @param {*} options
 */
function scheduleSyncUiState(options) {
    syncUiState(options);
    if (UI_SYNC_PASSES < 2) return;
    requestAnimationFrame(() => syncUiState(options));
}

/**
 * scheduleDelayedVisualSync を実行する
 * @param {*} delayMs
 */
function scheduleDelayedVisualSync(delayMs) {
    const delay = Number.isFinite(delayMs) ? delayMs : 200;
    setTimeout(() => scheduleSyncUiState({ visual: true, search: false }), delay);
}

// ===== UI Sync (private) =====

/**
 * syncVisualUI を実行する
 */
function syncVisualUI() {
    syncThemeUI();
    syncThumbnailUI();
}

/**
 * syncThemeUI を実行する
 */
function syncThemeUI() {
    applyThemeFromStorage();
}

/**
 * syncThumbnailUI を実行する
 */
function syncThumbnailUI() {
    applyThumbnailFromStorage();
}

/**
 * applyThemeFromStorage を実行する
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
 * needsFilterReset を実行する
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
 * syncSearchQueryIfNeeded を実行する
 */
function syncSearchQueryIfNeeded() {
    if (ui.userTouchedQuery) return false;
    const searchBox = ui.el.searchBox;
    if (!searchBox || searchBox.value === "") return false;
    resetSearchQuery();
    return true;
}

/**
 * syncSearchFiltersIfNeeded を実行する
 */
function syncSearchFiltersIfNeeded() {
    syncFormatCheckboxesFromState();
    if (ui.userTouchedFilters) return false;
    if (!needsFilterReset()) return false;
    resetSearchFilters();
    return true;
}

/**
 * syncSearchUI を実行する
 */
function syncSearchUI() {
    const shouldSearch = syncSearchQueryIfNeeded() || syncSearchFiltersIfNeeded();
    if (shouldSearch && ui.dataReady) scheduleSearch({ immediate: true });
}

// ===== Data Loading / Parsing (public) =====

/**
 * loadInitialData を実行する
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
 * initFilterMenu を実行する
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
 * applyLoadedCsv を実行する
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
