(() => {
/**
 * かねきかう 歌サーチ
 */
const RANDOM_DISPLAY_COUNT = 48;
const MIN_PERFORMANCE_FOR_RANDOM = 3;
const INCREMENT_COUNT = 48;
const PUBLIC_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-cSDIsEc3sqIOkmiuuSeaUKmNb2gBvM_NoH8-Se5ZrosaSOdMhPo3RuvxhZirUPJ_ll8PGnbRnJeF/pub?gid=1763338905&single=true&output=csv";
const DEFAULT_FORMATS = ["配信", "歌みた", "ショート", "切り抜き"];
const CSV_CACHE_KEY = "cachedCsv";
const SEARCH_STATE_KEY = "searchStateV1";
// Paint preview/フォーム復元の後追い対策で複数回同期する。
const UI_SYNC_PASSES = 2;
const SEARCH_DEBOUNCE_MS = 200;
const YT_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";
const YT_IFRAME_API_SELECTOR = 'script[data-yt-iframe-api="true"]';
const YT_IFRAME_READY_POLL_MS = 50;

const state = {
    data: {
        allSongsRaw: [],
        currentResults: [],
        displayLimit: RANDOM_DISPLAY_COUNT
    },
        ui: {
        selectedFormats: new Set(),
        scrollObserver: null,
        showThumbnails: false,
        dataReady: false,
        userTouchedQuery: false,
        userTouchedFilters: false,
        hasRestoredSearchState: false,
        searchDebounceId: 0,
        cardPool: [],
        recommendedCache: null,
        activeThumb: null,
        el: {}, // DOM要素のキャッシュ用
        dateBounds: null,
        dateIndex: null,
        pendingDateValues: null
    },
    youtube: {
        apiPromise: null,
        players: new WeakMap()
    }
};
const data = state.data;
const ui = state.ui;
const youtube = state.youtube;

/**
 * @typedef {Object} SongRow
 * @property {string} date
 * @property {number | null} dateKey
 * @property {number} sourceIndex
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

// ===== Lifecycle (public) =====

/**
 * UI初期化をまとめて実行する
 * @returns {Promise<void>}
 */
async function initUI() {
    // 主要なDOM要素をキャッシュ
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
        formatsList: document.getElementById('formatsList')
    };
    if (isIOSWebKit()) document.documentElement.classList.add('ios');

    setupUIHandlers();
    initFilterMenu();
    setupTheme();
    setupThumbnailToggle();
    setupScrollObserver();
    setupSyncEvents();
    window.addEventListener('resize', setupScrollObserver);
    restoreSearchState();
    await loadInitialData();
}

/**
 * 初期化処理を起動する
 */
function boot() {
    initUI().catch((err) => {
        console.error("initUI failed", err);
    });
}

document.addEventListener('DOMContentLoaded', boot);

// ===== Lifecycle (private) =====

/**
 * ブラウザのフォーム復元でフィルタ状態が残るのを防ぐ
 */
function resetEphemeralFilters() {
    resetSearchFilters();
}

/**
 * ページ復元/フォーカスの同期を実行する
 */
function handleFocusSync() {
    scheduleSyncUiState();
}

/**
 * 可視状態の変化に合わせて同期する
 */
function handleVisibilitySync() {
    if (document.visibilityState !== "visible") return;
    scheduleSyncUiState();
}

/**
 * ページ復元後の同期をまとめて行う
 */
function handlePageShowSync() {
    scheduleSyncUiState();
    scheduleDelayedVisualSync();
}

/**
 * 復元タイミングに合わせたUI同期イベントを登録する
 */
function setupSyncEvents() {
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener("pageshow", handlePageShowSync);
}

// ===== UI Controls (public) =====

/**
 * UIイベント（サイドバー、検索、読み込み）を結び付ける
 */
function setupUIHandlers() {
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('open-sidebar');
    const closeBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebarScrollArea = document.querySelector('.sidebar-scroll-area');
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
        scrollLock.enable({ allowScrollElement: sidebarScrollArea });
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        focusSidebarFirst();
    });

    const closeMenu = () => {
        blurSidebarActiveElement(sidebar);
        sidebar.classList.remove('active');
        overlay.classList.remove('show');
        sidebar.setAttribute('aria-hidden', 'true');
        scrollLock.disable();
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
}

/**
 * 特定の日付セレクトグループをリセットする
 * @param {"from" | "to"} kind
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

// ===== Sidebar Accessibility =====

/**
 * 年選択時に月セレクトへフォーカスを移す
 * @param {HTMLSelectElement} target
 * @param {HTMLSelectElement | null} fromYear
 * @param {HTMLSelectElement | null} fromMonth
 * @param {HTMLSelectElement | null} toYear
 * @param {HTMLSelectElement | null} toMonth
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
 * サイドバー内にフォーカスが残っている場合はフォーカスを外す
 * @param {HTMLElement | null} sidebar
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
 * サイドバー内のフォーカス可能要素を列挙する
 * @param {HTMLElement | null} sidebar
 * @returns {HTMLElement[]}
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
 * サイドバー内の最初のフォーカス可能要素へ移動する
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
 * サイドバー内にフォーカスを閉じ込める簡易トラップ
 * @param {KeyboardEvent} event
 * @param {HTMLElement | null} sidebar
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

// ===== Scroll Lock (Sidebar) =====

/**
 * サイドバー表示中の背景スクロールを抑止するユーティリティ
 * @returns {{ enable: (options?: { allowScrollElement?: Element | null }) => void, disable: () => void }}
 */
const scrollLock = (() => {
    let locked = false;
    let lockedScrollY = 0;
    let scrollArea = null;
    let lastTouchY = 0;
    let viewportResizeHandler = null;
    let viewportScrollHandler = null;
    let windowScrollLockHandler = null;
    let docScrollBlocker = null;
    let scrollAreaStartHandler = null;
    let scrollAreaMoveHandler = null;

    /**
     * ルート要素へスクロール抑止クラスを付与/解除する
     * @param {boolean} isLocked
     */
    function setLockedClasses(isLocked) {
        document.documentElement.classList.toggle('no-scroll', isLocked);
        document.body.classList.toggle('no-scroll', isLocked);
    }

    /**
     * visualViewport の高さに合わせて固定サイズを更新する
     */
    function updateViewportHeight() {
        const vv = window.visualViewport;
        if (!vv) return;
        document.body.style.height = `${vv.height}px`;
        enforceScrollPosition();
    }

    /**
     * 固定スクロール位置へ強制的に戻す
     */
    function enforceScrollPosition() {
        if (!locked) return;
        if (window.scrollY !== lockedScrollY) {
            window.scrollTo(0, lockedScrollY);
            document.body.style.top = `-${lockedScrollY}px`;
        }
    }

    /**
     * visualViewport 変化の監視を開始する
     */
    function installViewportHandlers() {
        const vv = window.visualViewport;
        if (!vv || viewportResizeHandler) return;
        viewportResizeHandler = () => updateViewportHeight();
        viewportScrollHandler = () => updateViewportHeight();
        vv.addEventListener('resize', viewportResizeHandler);
        vv.addEventListener('scroll', viewportScrollHandler);
    }

    /**
     * visualViewport 変化の監視を解除する
     */
    function removeViewportHandlers() {
        const vv = window.visualViewport;
        if (!vv || !viewportResizeHandler) return;
        vv.removeEventListener('resize', viewportResizeHandler);
        vv.removeEventListener('scroll', viewportScrollHandler);
        viewportResizeHandler = null;
        viewportScrollHandler = null;
    }

    /**
     * window スクロールを監視して位置固定を維持する
     */
    function installWindowScrollLock() {
        if (windowScrollLockHandler) return;
        windowScrollLockHandler = () => enforceScrollPosition();
        window.addEventListener('scroll', windowScrollLockHandler, { passive: true });
    }

    /**
     * window スクロール監視を解除する
     */
    function removeWindowScrollLock() {
        if (!windowScrollLockHandler) return;
        window.removeEventListener('scroll', windowScrollLockHandler);
        windowScrollLockHandler = null;
    }

    /**
     * ドキュメント全体のスクロールイベントを遮断する
     */
    function installDocumentBlocker() {
        if (docScrollBlocker) return;
        docScrollBlocker = (e) => {
            if (!locked) return;
            const target = e.target;
            if (target instanceof Element && target.closest('#sidebar')) return;
            e.preventDefault();
        };
        document.addEventListener('touchmove', docScrollBlocker, { passive: false, capture: true });
        document.addEventListener('wheel', docScrollBlocker, { passive: false, capture: true });
    }

    /**
     * ドキュメントのスクロール遮断を解除する
     */
    function removeDocumentBlocker() {
        if (!docScrollBlocker) return;
        document.removeEventListener('touchmove', docScrollBlocker, { capture: true });
        document.removeEventListener('wheel', docScrollBlocker, { capture: true });
        docScrollBlocker = null;
    }

    /**
     * スクロール領域の端で背景に伝播する動作を抑止する
     */
    function installScrollAreaGuard() {
        if (!scrollArea || scrollAreaMoveHandler) return;
        scrollAreaStartHandler = (e) => {
            if (e.touches && e.touches.length > 0) {
                lastTouchY = e.touches[0].clientY;
            }
        };
        scrollAreaMoveHandler = (e) => {
            if (!e.touches || e.touches.length === 0) return;
            const currentY = e.touches[0].clientY;
            const deltaY = currentY - lastTouchY;
            const atTop = scrollArea.scrollTop <= 0;
            const atBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1;
            if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
                e.preventDefault();
            }
            e.stopPropagation();
            lastTouchY = currentY;
        };
        scrollArea.addEventListener('touchstart', scrollAreaStartHandler, { passive: true });
        scrollArea.addEventListener('touchmove', scrollAreaMoveHandler, { passive: false });
    }

    /**
     * スクロール領域ガードを解除する
     */
    function removeScrollAreaGuard() {
        if (!scrollArea || !scrollAreaMoveHandler) return;
        scrollArea.removeEventListener('touchmove', scrollAreaMoveHandler);
        if (scrollAreaStartHandler) {
            scrollArea.removeEventListener('touchstart', scrollAreaStartHandler);
        }
        scrollAreaStartHandler = null;
        scrollAreaMoveHandler = null;
    }

    /**
     * 背景スクロール抑止を有効化する
     * @param {{ allowScrollElement?: Element | null }} [options]
     */
    function enable({ allowScrollElement } = {}) {
        if (locked) return;
        locked = true;
        scrollArea = allowScrollElement || null;
        lockedScrollY = window.scrollY || window.pageYOffset || 0;
        setLockedClasses(true);
        document.body.style.top = `-${lockedScrollY}px`;
        updateViewportHeight();
        installViewportHandlers();
        installWindowScrollLock();
        installDocumentBlocker();
        installScrollAreaGuard();
        requestAnimationFrame(() => enforceScrollPosition());
    }

    /**
     * 背景スクロール抑止を解除する
     */
    function disable() {
        if (!locked) return;
        locked = false;
        setLockedClasses(false);
        removeViewportHandlers();
        removeWindowScrollLock();
        removeDocumentBlocker();
        removeScrollAreaGuard();
        document.body.style.top = "";
        document.body.style.height = "";
        window.scrollTo(0, lockedScrollY);
        scrollArea = null;
    }

    return { enable, disable };
})();

/**
 * すべての検索・フィルタ条件を初期状態にリセットする
 */
function clearSearch() {
    resetSearchConditions(true);
    saveSearchState();
}

/**
 * 保存済みテーマを反映してUIを同期する
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
 * サムネ表示のオン/オフを初期化する
 */
function setupThumbnailToggle() {
    const thumbToggle = ui.el.thumbToggle;
    const savedSetting = localStorage.getItem('showThumbnails');
    let isShow = savedSetting !== null ? (savedSetting === 'true') : false;
    ui.showThumbnails = isShow;

    thumbToggle.checked = isShow;
    if (!isShow) document.body.classList.add('hide-thumbs');

    thumbToggle.addEventListener('change', () => {
        const checked = thumbToggle.checked;
        ui.showThumbnails = checked;
        document.body.classList.toggle('hide-thumbs', !checked);
        localStorage.setItem('showThumbnails', checked);
        updateDisplay();
        setupScrollObserver();
    });
}

// ===== UI Controls (private) =====

/**
 * フィルタ変更を検知して再検索を予約する
 * @param {{ immediate?: boolean }} [options]
 */
function markFilterTouched(options) {
    ui.userTouchedFilters = true;
    scheduleSearch(options);
    saveSearchState();
}

/**
 * 検索語の変更を検知して再検索を予約する
 */
function markQueryTouched() {
    ui.userTouchedQuery = true;
    scheduleSearch();
    saveSearchState();
}

/**
 * 検索デバウンスを解除する
 */
function clearSearchDebounce() {
    if (ui.searchDebounceId) {
        clearTimeout(ui.searchDebounceId);
        ui.searchDebounceId = 0;
    }
}

/**
 * 検索語を初期状態に戻す
 */
function resetSearchQuery() {
    if (ui.el.searchBox) ui.el.searchBox.value = "";
    ui.userTouchedQuery = false;
}

/**
 * フィルタ条件を初期状態に戻す
 */
function resetSearchFilters() {
    const relayOnly = ui.el.relayOnly;
    const harmonyOnly = ui.el.harmonyOnly;
    const formatCheckboxes = document.querySelectorAll('#formatsList input[type="checkbox"]');

    if (relayOnly) relayOnly.checked = false;
    if (harmonyOnly) harmonyOnly.checked = false;
    resetDateSelects();
    ui.pendingDateValues = null;

    ui.selectedFormats.clear();
    DEFAULT_FORMATS.forEach(f => ui.selectedFormats.add(f));
    formatCheckboxes.forEach(cb => { cb.checked = true; });
    ui.userTouchedFilters = false;
}

/**
 * 検索条件を初期状態に戻す（検索語・チェック・形態）
 * @param {boolean} shouldSearch
 */
function resetSearchConditions(shouldSearch) {
    clearSearchDebounce();
    resetSearchQuery();
    resetSearchFilters();
    if (shouldSearch && ui.dataReady) scheduleSearch({ immediate: true });
}

// ===== Search State Persistence (private) =====

/**
 * 現在の検索状態を保存する
 */
function saveSearchState() {
    try {
        const searchBox = ui.el.searchBox;
        const relayOnly = ui.el.relayOnly;
        const harmonyOnly = ui.el.harmonyOnly;
        const dateFrom = getDateSelectValue("from");
        const dateTo = getDateSelectValue("to");
        const payload = {
            query: searchBox ? searchBox.value : "",
            relayOnly: relayOnly ? !!relayOnly.checked : false,
            harmonyOnly: harmonyOnly ? !!harmonyOnly.checked : false,
            dateFrom,
            dateTo,
            formats: Array.from(ui.selectedFormats)
        };
        localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(payload));
    } catch (e) {}
}

/**
 * 保存済み検索状態を復元する
 */
function restoreSearchState() {
    try {
        const raw = localStorage.getItem(SEARCH_STATE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const searchBox = ui.el.searchBox;
        const relayOnly = ui.el.relayOnly;
        const harmonyOnly = ui.el.harmonyOnly;
        const formatCheckboxes = document.querySelectorAll('#formatsList input[type="checkbox"]');
        const formats = Array.isArray(parsed.formats) ? parsed.formats : [];
        const allowed = new Set(DEFAULT_FORMATS);
        ui.selectedFormats.clear();
        formats.forEach((f) => {
            if (allowed.has(f)) ui.selectedFormats.add(f);
        });
        if (ui.selectedFormats.size === 0) {
            DEFAULT_FORMATS.forEach((f) => ui.selectedFormats.add(f));
        }
        formatCheckboxes.forEach((cb) => {
            cb.checked = ui.selectedFormats.has(cb.value);
        });
        if (searchBox && typeof parsed.query === "string") {
            searchBox.value = parsed.query;
        }
        if (relayOnly) relayOnly.checked = !!parsed.relayOnly;
        if (harmonyOnly) harmonyOnly.checked = !!parsed.harmonyOnly;
        const pending = {
            from: typeof parsed.dateFrom === "string" ? parsed.dateFrom : "",
            to: typeof parsed.dateTo === "string" ? parsed.dateTo : ""
        };
        ui.pendingDateValues = pending;
        if (ui.dateBounds) {
            applyPendingDateValues();
        }
        ui.userTouchedQuery = true;
        ui.userTouchedFilters = true;
        ui.hasRestoredSearchState = true;
    } catch (e) {}
}

// ===== UI Sync (public) =====

/**
 * ペイント復元後のUI状態を同期する
 * @param {{visual?: boolean, search?: boolean}} [options]
 */
function syncUiState(options) {
    const opts = options || {};
    const shouldSyncVisual = opts.visual !== false;
    const shouldSyncSearch = opts.search !== false;
    if (shouldSyncVisual) syncVisualUI();
    if (shouldSyncSearch) syncSearchUI();
}

/**
 * 2段階でUI状態を同期する
 * @param {{visual?: boolean, search?: boolean}} [options]
 */
function scheduleSyncUiState(options) {
    syncUiState(options);
    if (UI_SYNC_PASSES < 2) return;
    requestAnimationFrame(() => syncUiState(options));
}

/**
 * 復元直後の描画ズレを緩和するために再同期を遅らせる
 * @param {number} [delayMs]
 */
function scheduleDelayedVisualSync(delayMs) {
    const delay = Number.isFinite(delayMs) ? delayMs : 200;
    setTimeout(() => scheduleSyncUiState({ visual: true, search: false }), delay);
}

// ===== UI Sync (private) =====

/**
 * 見た目系のUIを同期する
 */
function syncVisualUI() {
    syncThemeUI();
    syncThumbnailUI();
}

/**
 * 保存済みテーマを反映してUIを同期する
 */
function syncThemeUI() {
    applyThemeFromStorage();
}

/**
 * 保存済みサムネ設定を反映してUIを同期する
 */
function syncThumbnailUI() {
    applyThumbnailFromStorage();
}

/**
 * ローカルストレージ/システム設定からテーマを復元する
 */
function applyThemeFromStorage() {
    const themeToggle = ui.el.themeToggle;
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDarkMode = savedTheme ? (savedTheme === 'dark') : systemPrefersDark;
    document.documentElement.classList.toggle('dark-theme', isDarkMode);
    if (themeToggle) themeToggle.checked = isDarkMode;
}

/**
 * 保存済みサムネ設定を反映してUIを同期する
 */
function applyThumbnailFromStorage() {
    const thumbToggle = ui.el.thumbToggle;
    const savedSetting = localStorage.getItem('showThumbnails');
    const isShow = savedSetting !== null ? (savedSetting === 'true') : false;
    const prev = ui.showThumbnails;
    ui.showThumbnails = isShow;
    if (thumbToggle) thumbToggle.checked = isShow;
    document.body.classList.toggle('hide-thumbs', !isShow);
    if (prev !== isShow && ui.dataReady) {
        updateDisplay();
        setupScrollObserver();
    }
}

// ===== Search Sync / Filters (private) =====
/**
 * 形態フィルタが初期状態か判定する
 * @returns {boolean}
 */
function areFormatsDefault() {
    if (ui.selectedFormats.size !== DEFAULT_FORMATS.length) return false;
    return areAllFormatsSelected();
}

/**
 * すべての形態フィルタが選択されているか判定する
 * @returns {boolean}
 */
function areAllFormatsSelected() {
    return DEFAULT_FORMATS.every(f => ui.selectedFormats.has(f));
}

/**
 * フィルタが初期状態からずれているか判定する
 * @returns {boolean}
 */
function needsFilterReset() {
    const relayOnly = ui.el.relayOnly;
    const harmonyOnly = ui.el.harmonyOnly;
    if (relayOnly && relayOnly.checked) return true;
    if (harmonyOnly && harmonyOnly.checked) return true;
    if (hasDateSelection()) return true;
    const formatCheckboxes = document.querySelectorAll('#formatsList input[type="checkbox"]');
    for (const cb of formatCheckboxes) {
        if (!cb.checked) return true;
    }
    return !areFormatsDefault();
}

/**
 * 検索語を初期条件に戻すべきか判定し同期する
 * @returns {boolean}
 */
function syncSearchQueryIfNeeded() {
    if (ui.userTouchedQuery) return false;
    const searchBox = ui.el.searchBox;
    if (!searchBox || searchBox.value === "") return false;
    resetSearchQuery();
    return true;
}

/**
 * フィルタを初期条件に戻すべきか判定し同期する
 * @returns {boolean}
 */
function syncSearchFiltersIfNeeded() {
    if (ui.userTouchedFilters) return false;
    if (!needsFilterReset()) return false;
    resetSearchFilters();
    return true;
}

/**
 * 検索UIの状態を初期条件と同期する
 */
function syncSearchUI() {
    const shouldSearch = syncSearchQueryIfNeeded() || syncSearchFiltersIfNeeded();
    if (shouldSearch && ui.dataReady) scheduleSearch({ immediate: true });
}

// ===== Data Loading / Parsing (public) =====

/**
 * CSVを読み込み、初期データとフィルタを構築する
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
 * 形態フィルタのチェックボックス一覧を生成する
 */
function initFilterMenu() {
    const container = ui.el.formatsList;
    if (!container || container.childElementCount > 0) return;
    DEFAULT_FORMATS.forEach(fmt => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = fmt;
        cb.checked = true;
        ui.selectedFormats.add(fmt);
        cb.addEventListener('change', (e) => {
            ui.userTouchedFilters = true;
            if (e.target.checked) ui.selectedFormats.add(e.target.value);
            else ui.selectedFormats.delete(e.target.value);
            scheduleSearch();
            saveSearchState();
        });
        label.append(cb, " " + fmt);
        container.appendChild(label);
    });
}

/**
 * 読み込んだCSVの内容を状態へ反映する
 * @param {string} csvText
 * @param {string | null} statusLabel
 */
function applyLoadedCsv(csvText, statusLabel) {
    data.allSongsRaw = parseCsvToSongs(csvText);
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
    requestAnimationFrame(() => youtubeApi.ensureReady().catch(() => {}));
}

/**
 * CSVを解析してSongRowの配列へ変換する
 * @param {string} csvText
 * @returns {Array<SongRow>}
 */
function parseCsvToSongs(csvText) {
    const rows = parseCsvRFC4180(csvText);
    const header = rows[0];
    const required = ["公開範囲", "#", "曲名", "アーティスト名", "キョクメイ", "アーティストメイ", "配信日", "形態", "歌枠リレー？", "ハモリあり？", "URL", "メモ"];
    const missing = required.filter(name => !header.includes(name));
    if (missing.length > 0) {
        throw new Error(`CSVヘッダ不足: ${missing.join(", ")}`);
    }
    const body = rows.slice(1);
    const idxMap = Object.fromEntries(header.map((name, index) => [name, index]));
    const idx = (n) => idxMap[n];
    const songs = [];
    for (let i = 0; i < body.length; i++) {
        const r = body[i];
        const memo = r[idx("メモ")] || "";
        const memoUpper = memo.toUpperCase();
        const memoAllows = !memoUpper.includes("URL") && !memoUpper.includes("URI");
        const url = r[idx("URL")] || "";
        if (r[idx("公開範囲")] !== "全体" || !r[idx("#")] || !memoAllows || url.trim() === "") continue;
        const title = r[idx("曲名")];
        const artist = r[idx("アーティスト名")];
        const titleYomi = r[idx("キョクメイ")];
        const artistYomi = r[idx("アーティストメイ")];
        songs.push({
            date: r[idx("配信日")],
            dateKey: parseDateKey(r[idx("配信日")]),
            sourceIndex: i,
            format: r[idx("形態")],
            isRelay: r[idx("歌枠リレー？")] === "◯",
            isHarmony: r[idx("ハモリあり？")] === "◯",
            title,
            artist,
            titleYomi,
            artistYomi,
            url,
            titleNorm: normalizeForSearch(title),
            artistNorm: normalizeForSearch(artist),
            titleYomiNorm: normalizeForSearch(titleYomi),
            artistYomiNorm: normalizeForSearch(artistYomi)
        });
    }
    return songs;
}

/**
 * RFC4180準拠でCSV文字列を2次元配列にパースする
 * @param {string} t
 * @returns {string[][]}
 */
function parseCsvRFC4180(t) {
    let res = [], row = [], field = "", inQ = false;
    for (let i = 0; i < t.length; i++) {
        let c = t[i];
        if (inQ) {
            if (c === '"' && t[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                inQ = false;
            } else {
                field += c;
            }
        } else {
            if (c === '"') {
                inQ = true;
            } else if (c === ',') {
                row.push(field);
                field = "";
            } else if (c === '\n' || c === '\r') {
                row.push(field);
                res.push(row);
                row = [];
                field = "";
                if (c === '\r' && t[i + 1] === '\n') i++;
            } else {
                field += c;
            }
        }
    }
    row.push(field);
    res.push(row);
    while (res.length > 0 && res[res.length - 1].every(v => v === "")) {
        res.pop();
    }
    return res;
}


// ===== Search / Recommendation (public) =====

/**
 * 入力中の検索をまとめて実行する
 * @param {{ immediate?: boolean }} [options]
 */
function scheduleSearch(options) {
    if (ui.searchDebounceId) clearTimeout(ui.searchDebounceId);
    if (options && options.immediate) {
        search();
        return;
    }
    ui.searchDebounceId = setTimeout(() => {
        ui.searchDebounceId = 0;
        search();
    }, SEARCH_DEBOUNCE_MS);
}

/**
 * 検索条件に応じて結果を更新する
 */
function search() {
    const searchState = getSearchState();
    const resCount = ui.el.resultCount;

    const { results, displayLimit, label } = resolveSearchResults(searchState);
    data.currentResults = results;
    data.displayLimit = displayLimit;
    resCount.innerText = label;
    updateDisplay();
}

// ===== Search / Recommendation (private) =====

/**
 * 検索条件の現在値を取得する
 * @returns {{queryRaw: string, relayOnly: boolean, harmonyOnly: boolean, dateFromKey: number | null, dateToKey: number | null, hasDateFilter: boolean}}
 */
function getSearchState() {
    const fromRange = getPartialDateRange("from");
    const toRange = getPartialDateRange("to");
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
 * おすすめ表示条件を満たしているか判定する
 * @param {{queryRaw: string, relayOnly: boolean, harmonyOnly: boolean, hasDateFilter: boolean}} searchState
 * @returns {boolean}
 */
function isRecommendedMode(searchState) {
    return searchState.queryRaw === "" &&
           !searchState.relayOnly &&
           !searchState.harmonyOnly &&
           !searchState.hasDateFilter &&
           areAllFormatsSelected();
}

/**
 * 検索結果と表示ラベルをまとめて返す
 * @param {{queryRaw: string, relayOnly: boolean, harmonyOnly: boolean, dateFromKey: number | null, dateToKey: number | null, hasDateFilter: boolean}} searchState
 * @returns {{results: Array<SongRow>, displayLimit: number, label: string}}
 */
function resolveSearchResults(searchState) {
    if (isRecommendedMode(searchState)) {
        return {
            results: pickRecommended(),
            displayLimit: RANDOM_DISPLAY_COUNT,
            label: "おすすめを表示中"
        };
    }
    const results = filterSongs(searchState);
    return {
        results,
        displayLimit: INCREMENT_COUNT,
        label: `${results.length} 件がヒット`
    };
}

// ===== Date Filters (private) =====

// --- Date Index ---

/**
 * 配信日インデックスを構築する
 * @param {Array<SongRow>} songs
 * @returns {Map<string, number[]>}
 */
function buildDateIndex(songs) {
    const index = new Map();
    for (const row of songs) {
        if (!row.dateKey) continue;
        const { year, month, day } = dateKeyToParts(row.dateKey);
        const key = `${year}-${String(month).padStart(2, "0")}`;
        if (!index.has(key)) index.set(key, new Set());
        index.get(key).add(day);
    }
    const normalized = new Map();
    for (const [key, set] of index.entries()) {
        normalized.set(key, Array.from(set).sort((a, b) => a - b));
    }
    return normalized;
}

/**
 * 指定年月の配信日リストを取得する
 * @param {string} year
 * @param {string} month
 * @returns {number[]}
 */
function getAvailableDays(year, month) {
    if (!ui.dateIndex) return [];
    const key = `${year}-${month}`;
    return ui.dateIndex.get(key) || [];
}

// --- Date Select State ---

/**
 * 日付セレクトが選択済みか判定する
 * @returns {boolean}
 */
function hasDateSelection() {
    return hasPartialDateSelection("from") || hasPartialDateSelection("to");
}

/**
 * 日付セレクトのいずれかが入力されているか判定する
 * @param {"from" | "to"} kind
 * @returns {boolean}
 */
function hasPartialDateSelection(kind) {
    const parts = getDateSelectParts(kind);
    return parts.year !== "" || parts.month !== "" || parts.day !== "";
}

/**
 * 日付セレクトの選択値を取得する
 * @param {"from" | "to"} kind
 * @returns {{year: string, month: string, day: string}}
 */
function getDateSelectParts(kind) {
    const isFrom = kind === "from";
    const year = (isFrom ? ui.el.dateFromYear : ui.el.dateToYear)?.value ?? "";
    const month = (isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth)?.value ?? "";
    const day = (isFrom ? ui.el.dateFromDay : ui.el.dateToDay)?.value ?? "";
    return { year, month, day };
}

/**
 * 日付セレクトの値を YYYY-MM-DD で返す
 * @param {"from" | "to"} kind
 * @returns {string}
 */
function getDateSelectValue(kind) {
    const { year, month, day } = getDateSelectParts(kind);
    if (!year || !month || !day) return "";
    return `${year}-${month}-${day}`;
}

/**
 * 日付セレクトへ YYYY-MM-DD を反映する
 * @param {"from" | "to"} kind
 * @param {string} value
 */
function applyDateSelectValue(kind, value) {
    if (!value) return;
    const key = parseDateKey(value);
    if (!key) return;
    const { year, month, day } = dateKeyToParts(key);
    const isFrom = kind === "from";
    const yearSelect = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
    const monthSelect = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
    const daySelect = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
    if (!yearSelect || !monthSelect || !daySelect) return;
    yearSelect.value = String(year);
    syncDateSelectOptions(kind);
    monthSelect.value = String(month).padStart(2, "0");
    syncDateSelectOptions(kind);
    daySelect.value = String(day).padStart(2, "0");
}

/**
 * 日付セレクトを初期状態へ戻す
 */
function resetDateSelects() {
    ["from", "to"].forEach((kind) => {
        const isFrom = kind === "from";
        const year = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
        const month = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
        const day = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
        if (year) year.value = "";
        if (month) month.value = "";
        if (day) day.value = "";
    });
    syncDateSelectOptions();
}

// --- Date Range Constraints ---

/**
 * 部分的に入力された日付の範囲を取得する
 * @param {"from" | "to"} kind
 * @returns {{minKey: number, maxKey: number} | null}
 */
function getPartialDateRange(kind) {
    const { year, month, day } = getDateSelectParts(kind);
    if (!year) return null;
    const y = Number(year);
    if (!month) {
        return { minKey: y * 10000 + 101, maxKey: y * 10000 + 1231 };
    }
    const m = Number(month);
    const daysInMonth = new Date(y, m, 0).getDate();
    if (!day) {
        return { minKey: y * 10000 + m * 100 + 1, maxKey: y * 10000 + m * 100 + daysInMonth };
    }
    const d = Number(day);
    return { minKey: y * 10000 + m * 100 + d, maxKey: y * 10000 + m * 100 + d };
}

/**
 * 反対側の入力に基づいて範囲を制約する
 * @param {"from" | "to"} kind
 * @returns {{minKey: number, maxKey: number} | null}
 */
function getConstrainedBounds(kind) {
    if (!ui.dateBounds) return null;
    let minKey = ui.dateBounds.minKey;
    let maxKey = ui.dateBounds.maxKey;
    const otherKind = kind === "from" ? "to" : "from";
    const otherRange = getPartialDateRange(otherKind);
    if (otherRange) {
        if (kind === "to") {
            minKey = Math.max(minKey, otherRange.minKey);
        } else {
            maxKey = Math.min(maxKey, otherRange.maxKey);
        }
    }
    if (minKey > maxKey) {
        if (kind === "to") minKey = maxKey;
        else maxKey = minKey;
    }
    return { minKey, maxKey };
}

// --- Date Select UI ---

/**
 * 日付セレクトを初期化する
 * @param {{minKey: number, maxKey: number}} bounds
 */
function initDateSelects(bounds) {
    const { minKey, maxKey } = bounds;
    const minParts = dateKeyToParts(minKey);
    const maxParts = dateKeyToParts(maxKey);
    const years = [];
    for (let y = minParts.year; y <= maxParts.year; y++) {
        years.push(String(y));
    }
    buildSelectOptions(ui.el.dateFromYear, years, "年");
    buildSelectOptions(ui.el.dateToYear, years, "年");
    buildSelectOptions(ui.el.dateFromMonth, [], "月");
    buildSelectOptions(ui.el.dateToMonth, [], "月");
    buildSelectOptions(ui.el.dateFromDay, [], "日");
    buildSelectOptions(ui.el.dateToDay, [], "日");
    syncDateSelectOptions();
    applyPendingDateValues();
}

/**
 * セレクトに選択肢を反映する
 * @param {HTMLSelectElement | null} select
 * @param {string[]} values
 * @param {string} placeholder
 */
function buildSelectOptions(select, values, placeholder) {
    if (!select) return;
    const current = select.value;
    const fragment = document.createDocumentFragment();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = placeholder;
    fragment.appendChild(empty);
    values.forEach((val) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        fragment.appendChild(opt);
    });
    select.replaceChildren(fragment);
    if (values.includes(current)) {
        select.value = current;
    } else {
        select.value = "";
    }
}

/**
 * 日付セレクトの選択肢を現在の範囲に合わせて更新する
 * @param {"from" | "to"} [kind]
 */
function syncDateSelectOptions(kind) {
    if (!ui.dateBounds) return;
    const targets = kind ? [kind] : ["from", "to"];
    targets.forEach((k) => {
        const bounds = getConstrainedBounds(k) || ui.dateBounds;
        const isFrom = k === "from";
        const yearSelect = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
        const monthSelect = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
        const daySelect = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
        if (!yearSelect || !monthSelect || !daySelect) return;
        const minParts = dateKeyToParts(bounds.minKey);
        const maxParts = dateKeyToParts(bounds.maxKey);
        const yearVal = yearSelect.value;
        const years = buildNumberRange(minParts.year, maxParts.year).map((y) => String(y));
        buildSelectOptions(yearSelect, years, "年");
        const selectedYear = yearSelect.value;
        const minMonth = selectedYear === String(minParts.year) ? minParts.month : 1;
        const maxMonth = selectedYear === String(maxParts.year) ? maxParts.month : 12;
        const months = selectedYear ? buildNumberRange(minMonth, maxMonth).map((m) => String(m).padStart(2, "0")) : [];
        buildSelectOptions(monthSelect, months, "月");
        const monthVal = monthSelect.value;
        if (!selectedYear || !monthVal) {
            buildSelectOptions(daySelect, [], "日");
            return;
        }
        const monthNum = Number(monthVal);
        const availableDays = getAvailableDays(selectedYear, monthVal);
        if (availableDays.length === 0) {
            buildSelectOptions(daySelect, [], "日");
            return;
        }
        let minDay = availableDays[0];
        let maxDay = availableDays[availableDays.length - 1];
        if (selectedYear === String(minParts.year) && monthNum === minParts.month) minDay = Math.max(minDay, minParts.day);
        if (selectedYear === String(maxParts.year) && monthNum === maxParts.month) maxDay = Math.min(maxDay, maxParts.day);
        const days = availableDays
            .filter((d) => d >= minDay && d <= maxDay)
            .map((d) => String(d).padStart(2, "0"));
        buildSelectOptions(daySelect, days, "日");
    });
}

/**
 * 保留されている日付の復元値を適用する
 */
function applyPendingDateValues() {
    if (!ui.pendingDateValues) return;
    const { from, to } = ui.pendingDateValues;
    if (from) applyDateSelectValue("from", from);
    if (to) applyDateSelectValue("to", to);
    ui.pendingDateValues = null;
}

/**
 * 数値レンジ配列を生成する
 * @param {number} start
 * @param {number} end
 * @returns {number[]}
 */
function buildNumberRange(start, end) {
    const list = [];
    for (let i = start; i <= end; i++) list.push(i);
    return list;
}

/**
 * 入力された日付文字列を YYYYMMDD の数値に変換する
 * @param {string} raw
 * @returns {number | null}
 */
function parseDateKey(raw) {
    if (!raw) return null;
    const trimmed = raw.trim();
    const match = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(trimmed);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return year * 10000 + month * 100 + day;
}

/**
 * YYYYMMDD の数値を input[type="date"] 向けの YYYY-MM-DD に変換する
 * @param {number} key
 * @returns {string}
 */
function formatDateKeyForInput(key) {
    const year = Math.floor(key / 10000);
    const month = Math.floor((key % 10000) / 100);
    const day = key % 100;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
}

/**
 * YYYYMMDD を年/月/日に分解する
 * @param {number} key
 * @returns {{year: number, month: number, day: number}}
 */
function dateKeyToParts(key) {
    const year = Math.floor(key / 10000);
    const month = Math.floor((key % 10000) / 100);
    const day = key % 100;
    return { year, month, day };
}

/**
 * 読み込み済みデータから日付範囲を算出し入力のmin/maxを更新する
 * @param {Array<SongRow>} songs
 */
function applyDateInputRange(songs) {
    const dateFromYear = ui.el.dateFromYear;
    const dateFromMonth = ui.el.dateFromMonth;
    const dateFromDay = ui.el.dateFromDay;
    const dateToYear = ui.el.dateToYear;
    const dateToMonth = ui.el.dateToMonth;
    const dateToDay = ui.el.dateToDay;
    if (!dateFromYear || !dateFromMonth || !dateFromDay || !dateToYear || !dateToMonth || !dateToDay) return null;
    let minKey = null;
    let maxKey = null;
    for (const row of songs) {
        if (!row.dateKey) continue;
        if (minKey === null || row.dateKey < minKey) minKey = row.dateKey;
        if (maxKey === null || row.dateKey > maxKey) maxKey = row.dateKey;
    }
    if (minKey === null || maxKey === null) return null;
    const bounds = { minKey, maxKey };
    ui.dateBounds = bounds;
    ui.dateIndex = buildDateIndex(songs);
    initDateSelects(bounds);
    return bounds;
}

/**
 * 入力された日付を範囲内に収める
 * @param {number} minKey
 * @param {number} maxKey
 */
function clampDateInputsToBounds(minKey, maxKey) {
    const dateFrom = ui.el.dateFromYear;
    const dateTo = ui.el.dateToYear;
    if (!dateFrom || !dateTo) return;
    const clampKey = (key) => {
        if (key === null) return null;
        if (key < minKey) return minKey;
        if (key > maxKey) return maxKey;
        return key;
    };
    let fromKey = clampKey(parseDateKey(getDateSelectValue("from")));
    let toKey = clampKey(parseDateKey(getDateSelectValue("to")));
    if (fromKey !== null && toKey !== null && fromKey > toKey) {
        toKey = fromKey;
    }
    if (fromKey !== null) applyDateSelectValue("from", formatDateKeyForInput(fromKey));
    if (toKey !== null) applyDateSelectValue("to", formatDateKeyForInput(toKey));
}

/**
 * 現在の範囲に基づいて日付入力を補正する
 */
function clampDateInputsIfNeeded() {
    if (!ui.dateBounds) return;
    clampDateInputsToBounds(ui.dateBounds.minKey, ui.dateBounds.maxKey);
}

/**
 * 日付フィルタに一致するか判定する
 * @param {SongRow} row
 * @param {number | null} fromKey
 * @param {number | null} toKey
 * @returns {boolean}
 */
function isWithinDateRange(row, fromKey, toKey) {
    if (!fromKey && !toKey) return true;
    if (!row.dateKey) return false;
    if (fromKey && row.dateKey < fromKey) return false;
    if (toKey && row.dateKey > toKey) return false;
    return true;
}

/**
 * 検索条件で楽曲を絞り込む
 * @param {{queryRaw: string, relayOnly: boolean, harmonyOnly: boolean, dateFromKey: number | null, dateToKey: number | null, hasDateFilter: boolean}} searchState
 * @returns {Array<SongRow>}
 */
function filterSongs(searchState) {
    const queryNorm = normalizeForSearch(searchState.queryRaw);
    const keywords = queryNorm.split(/[\s\u3000]+/).filter(k => k.length > 0);
    return data.allSongsRaw.filter(row => {
        const matchText = keywords.every(kw =>
            row.titleNorm.includes(kw) ||
            row.artistNorm.includes(kw) ||
            row.titleYomiNorm.includes(kw) ||
            row.artistYomiNorm.includes(kw)
        );
        const matchDate = isWithinDateRange(row, searchState.dateFromKey, searchState.dateToKey);
        return matchText &&
            matchDate &&
            ui.selectedFormats.has(row.format) &&
            (!searchState.relayOnly || row.isRelay) &&
            (!searchState.harmonyOnly || row.isHarmony);
    });
}

/**
 * 配列を均等にシャッフルする
 * @template T
 * @param {T[]} list
 * @returns {T[]}
 */
function shuffleInPlace(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

/**
 * おすすめ表示用の楽曲を抽出する
 * @returns {Array<SongRow>}
 */
function pickRecommended() {
    // おすすめの並びは「同条件では固定」する方針。
    // 条件を一度変えて元に戻しても並びは維持し、CSV再読込時のみリセットされる。
    if (ui.recommendedCache) return ui.recommendedCache;
    ui.recommendedCache = selectRecommendedSongs(
        buildRecommendedGroups(data.allSongsRaw),
        RANDOM_DISPLAY_COUNT
    );
    return ui.recommendedCache;
}

/**
 * おすすめ抽出用に、各曲のセットを作る
 * @param {Array<SongRow>} songs
 * @returns {Array<{key: string, latestRows: SongRow[]}>}
 */
function buildRecommendedGroups(songs) {
    const groups = new Map();
    for (const row of songs) {
        if (!isRecommendedCountFormat(row.format)) continue;
        const key = getSongKey(row);
        if (!groups.has(key)) {
            groups.set(key, { rows: [], utamitaRows: [], streamRows: [], shortRows: [] });
        }
        const entry = groups.get(key);
        entry.rows.push(row);
        if (isUtamitaFormat(row.format)) entry.utamitaRows.push(row);
        if (isStreamFormat(row.format)) entry.streamRows.push(row);
        if (isShortFormat(row.format)) entry.shortRows.push(row);
    }
    const result = [];
    for (const [key, entry] of groups.entries()) {
        if (entry.rows.length < MIN_PERFORMANCE_FOR_RANDOM) continue;
        let latestRows = [];
        if (entry.utamitaRows.length > 0) {
            latestRows = entry.utamitaRows.slice(0, 1);
        } else if (entry.streamRows.length > 0) {
            latestRows = entry.streamRows.slice(0, MIN_PERFORMANCE_FOR_RANDOM);
        } else if (entry.shortRows.length > 0) {
            latestRows = entry.shortRows.slice(0, MIN_PERFORMANCE_FOR_RANDOM);
        }
        if (latestRows.length === 0) continue;
        result.push({ key, latestRows });
    }
    return result;
}

/**
 * おすすめセットから表示曲を選ぶ
 * @param {Array<{key: string, latestRows: SongRow[]}>} groups
 * @param {number} count
 * @returns {SongRow[]}
 */
function selectRecommendedSongs(groups, count) {
    const pickedGroups = shuffleInPlace(groups.slice()).slice(0, count);
    return pickedGroups.map(group => pickRandomEntry(group.latestRows));
}

/**
 * 配列から1件をランダムに選ぶ
 * @template T
 * @param {T[]} list
 * @returns {T}
 */
function pickRandomEntry(list) {
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
}

/**
 * 曲名とアーティストからキーを作る
 * @param {SongRow} row
 * @returns {string}
 */
function getSongKey(row) {
    return (row.title || '') + '|||' + (row.artist || '');
}

/**
 * おすすめ判定のカウント対象に含める形態かどうか判定する
 * @param {string} format
 * @returns {boolean}
 */
function isRecommendedCountFormat(format) {
    return isStreamFormat(format) || isUtamitaFormat(format) || isShortFormat(format);
}

/**
 * 歌みた形態かどうか判定する
 * @param {string} format
 * @returns {boolean}
 */
function isUtamitaFormat(format) {
    return format === "歌みた";
}

/**
 * 配信形態かどうか判定する
 * @param {string} format
 * @returns {boolean}
 */
function isStreamFormat(format) {
    return format === "配信";
}

/**
 * ショート形態かどうか判定する
 * @param {string} format
 * @returns {boolean}
 */
function isShortFormat(format) {
    return format === "ショート";
}

// ===== Rendering (private) =====

/**
 * 楽曲カードのベース要素を生成する
 * @returns {{card: HTMLDivElement, thumbDiv: HTMLDivElement, titleEl: HTMLAnchorElement, artistEl: HTMLDivElement, dateEl: HTMLSpanElement, tagsEl: HTMLDivElement}}
 */
function createCardElements() {
    const card = document.createElement("div");
    card.className = "song-card";

    const thumbDiv = document.createElement("div");
    thumbDiv.className = "thumb";

    const content = document.createElement("div");
    content.className = "content";

    const title = document.createElement("a");
    title.className = "title";

    const artist = document.createElement("div");
    artist.className = "artist";

    const footer = document.createElement("div");
    footer.className = "card-footer";

    const leftGroup = document.createElement("div");
    leftGroup.className = "footer-left";
    const date = document.createElement("span");
    leftGroup.append(date);

    const rightGroup = document.createElement("div");
    rightGroup.className = "footer-right";

    const tags = document.createElement("div");
    tags.className = "footer-tags";

    rightGroup.append(tags);
    footer.append(leftGroup, rightGroup);
    content.append(title, artist, footer);
    card.append(thumbDiv, content);

    return { card, thumbDiv, titleEl: title, artistEl: artist, dateEl: date, tagsEl: tags };
}

/**
 * 楽曲データでカード内容を更新する
 * @param {{card: HTMLDivElement, thumbDiv: HTMLDivElement, titleEl: HTMLAnchorElement, artistEl: HTMLDivElement, dateEl: HTMLSpanElement, tagsEl: HTMLDivElement}} entry
 * @param {SongRow} row
 */
function updateCardFromRow(entry, row) {
    const yt = extractYoutubeInfo(row.url);
    updateThumbnail(entry.thumbDiv, row, yt);
    updateTitleLink(entry.titleEl, row);
    entry.artistEl.textContent = row.artist || "不明";
    entry.dateEl.textContent = row.date;
    updateFooterTags(entry.tagsEl, row);
}

/**
 * タイトルのリンク状態を更新する
 * @param {HTMLAnchorElement} titleEl
 * @param {SongRow} row
 */
function updateTitleLink(titleEl, row) {
    titleEl.textContent = row.title || "無題";
    if (row.url) {
        titleEl.classList.add("title-link");
        titleEl.setAttribute("href", row.url);
        titleEl.setAttribute("target", "_blank");
        titleEl.setAttribute("rel", "noopener noreferrer");
    } else {
        titleEl.classList.remove("title-link");
        titleEl.removeAttribute("href");
        titleEl.removeAttribute("target");
        titleEl.removeAttribute("rel");
    }
}

/**
 * YouTubeの外部再生ボタンを生成する
 * @param {string} openUrl
 * @param {HTMLDivElement} thumbDiv
 * @returns {HTMLAnchorElement}
 */
function updateFooterTags(tags, row) {
    tags.replaceChildren();
    if (row.format) {
        const fmt = document.createElement("span");
        fmt.className = "tag";
        fmt.textContent = row.format;
        tags.appendChild(fmt);
    }
    if (row.isRelay) {
        const relay = document.createElement("span");
        relay.className = "tag tag-relay";
        relay.textContent = "🚩リレー";
        tags.appendChild(relay);
    }
    if (row.isHarmony) {
        const harmony = document.createElement("span");
        harmony.className = "tag tag-harmony";
        harmony.textContent = "✨ハモリ";
        tags.appendChild(harmony);
    }
}

/**
 * 空状態に表示する要素を生成する
 * @param {string} message
 * @returns {HTMLDivElement}
 */
function createEmptyStateElement(message) {
    const empty = document.createElement("div");
    empty.style.gridColumn = "1/-1";
    empty.style.textAlign = "center";
    empty.style.padding = "50px";
    empty.style.color = "var(--text-mute)";
    empty.textContent = message;
    return empty;
}

/**
 * 結果一覧の空状態メッセージを決める
 * @param {{queryRaw: string, relayOnly: boolean, harmonyOnly: boolean, dateFromRaw: string, dateToRaw: string, dateFromKey: number | null, dateToKey: number | null}} searchState
 * @returns {{kind: "loading" | "error" | "empty", message: string}}
 */
function getEmptyStateDescriptor(searchState) {
    if (!ui.dataReady) {
        return { kind: "loading", message: "読み込み中..." };
    }
    if (!areAllFormatsSelected() && ui.selectedFormats.size === 0) {
        return { kind: "error", message: "動画の種類を選択してください" };
    }
    return { kind: "empty", message: "見つかりませんでした" };
}

/**
 * 現在の表示対象を取得する
 * @returns {Array<SongRow>}
 */
function getVisibleResults() {
    return data.currentResults.slice(0, data.displayLimit);
}

/**
 * 空状態を表示する
 * @param {HTMLDivElement} container
 * @param {HTMLDivElement} loadMoreContainer
 */
function renderEmptyResults(container, loadMoreContainer) {
    const emptyState = getEmptyStateDescriptor(getSearchState());
    container.replaceChildren(createEmptyStateElement(emptyState.message));
    loadMoreContainer.classList.add('hidden');
}

/**
 * 結果カードのDOM配列を構築する
 * @param {Array<SongRow>} results
 * @returns {HTMLDivElement[]}
 */
function buildResultNodes(results) {
    const nodes = [];
    for (let i = 0; i < results.length; i++) {
        if (!ui.cardPool[i]) ui.cardPool[i] = createCardElements();
        const entry = ui.cardPool[i];
        updateCardFromRow(entry, results[i]);
        nodes.push(entry.card);
    }
    return nodes;
}

/**
 * 表示中のカードに対してサムネ監視を設定する
 * @param {number} count
 */
function observeVisibleThumbnails(count) {
    if (!ui.showThumbnails || !ui.scrollObserver) return;
    for (let i = 0; i < count; i++) {
        ui.scrollObserver.observe(ui.cardPool[i].thumbDiv);
    }
}

/**
 * 追加読み込みボタンの表示状態を更新する
 * @param {boolean} recommendedMode
 */
function updateLoadMoreVisibility(recommendedMode) {
    const loadMoreContainer = ui.el.loadMoreContainer;
    if (!recommendedMode && data.currentResults.length > data.displayLimit) {
        loadMoreContainer.classList.remove('hidden');
    } else {
        loadMoreContainer.classList.add('hidden');
    }
}

// ===== Rendering (public) =====

/**
 * 現在の検索結果をカードとして描画する
 */
function updateDisplay() {
    const container = ui.el.resultList;

    if (ui.scrollObserver) ui.scrollObserver.disconnect();
    if (ui.showThumbnails && !ui.scrollObserver) setupScrollObserver();

    const results = getVisibleResults();

    if (results.length === 0) {
        renderEmptyResults(container, ui.el.loadMoreContainer);
        return;
    }

    const nodes = buildResultNodes(results);

    container.replaceChildren(...nodes);
    observeVisibleThumbnails(results.length);
    updateLoadMoreVisibility(isRecommendedMode(getSearchState()));
}

// ===== Thumbnail / Embed (private) =====

/**
 * サムネイル要素の初期状態を整える
 * @param {HTMLDivElement} thumbDiv
 * @param {string} videoId
 */
function resetThumbnailContainer(thumbDiv, videoId) {
    thumbDiv.dataset.videoId = videoId;
    thumbDiv.classList.remove("playing", "paused");
    thumbDiv.onclick = null;
    thumbDiv.replaceChildren();
}

/**
 * サムネイル画像を生成する
 * @param {string} videoId
 * @returns {HTMLImageElement}
 */
function createThumbnailImage(videoId) {
    const img = document.createElement("img");
    img.dataset.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    return img;
}

/**
 * サムネイル画像を生成して要素へ反映する
 * @param {HTMLDivElement} thumbDiv
 * @param {string} videoId
 * @param {{eager?: boolean}} [options]
 */
function applyThumbnailImage(thumbDiv, videoId, options) {
    const img = createThumbnailImage(videoId);
    if (options && options.eager) img.src = img.dataset.src;
    thumbDiv.replaceChildren(img);
}

/**
 * サムネイルを今すぐ読み込むべきか判定する
 * @param {HTMLDivElement} thumbDiv
 * @returns {boolean}
 */
function shouldLoadThumbnailNow(thumbDiv) {
    const rect = thumbDiv.getBoundingClientRect();
    const viewHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.bottom > 0 && rect.top < viewHeight;
}

/**
 * 再生状態をUIへ反映する
 * @param {HTMLDivElement} thumbDiv
 * @param {"playing" | "paused" | "stopped"} state
 */
function setPlaybackState(thumbDiv, state) {
    thumbDiv.classList.remove("playing", "paused");
    if (state === "playing") {
        thumbDiv.classList.add("playing");
    } else if (state === "paused") {
        thumbDiv.classList.add("paused");
    }
}

/**
 * 再生中カードを更新する（必要なら前の再生を停止）
 * @param {HTMLDivElement} thumbDiv
 */
function setActiveThumb(thumbDiv) {
    if (ui.activeThumb && ui.activeThumb !== thumbDiv) {
        restoreThumbnail(ui.activeThumb, ui.activeThumb.dataset.videoId || "");
    }
    ui.activeThumb = thumbDiv;
}

/**
 * 再生中カードの参照を解除する
 * @param {HTMLDivElement} thumbDiv
 */
function clearActiveThumb(thumbDiv) {
    if (ui.activeThumb === thumbDiv) ui.activeThumb = null;
}

/**
 * IntersectionObserverの通知でサムネ読み込みと再生停止を制御する
 * @param {IntersectionObserverEntry[]} entries
 */
function handleScrollObserver(entries) {
    entries.forEach(entry => {
        const thumb = entry.target;
        if (entry.isIntersecting) {
            // 画面内に入ったタイミングでサムネを遅延読み込み
            const img = thumb.querySelector('img');
            const srcAttr = img ? img.getAttribute("src") : null;
            if (img && (!srcAttr || srcAttr === "about:blank")) {
                const dataSrc = img.dataset.src;
                if (dataSrc) img.src = dataSrc;
            }
            return;
        }
        if (!entry.isIntersecting) {
            // スクロールアウト時に再生停止しない（必要になれば戻せるように残す）
            if (true) return;
            const iframe = thumb.querySelector('iframe');
            if (!iframe) return;
            iframe.src = "about:blank";
            const videoId = thumb.dataset.videoId;
            thumb.classList.remove("playing");
            if (videoId) {
                applyThumbnailImage(thumb, videoId);
            } else {
                thumb.replaceChildren();
            }
        }
    });
}

/**
 * ヘッダーの高さを考慮したIntersectionObserverを構築する
 */
function setupScrollObserver() {
    const header = document.querySelector('.header');
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    if (ui.scrollObserver) ui.scrollObserver.disconnect();
    ui.scrollObserver = new IntersectionObserver(handleScrollObserver, {
        threshold: 0,
        rootMargin: `-${headerHeight}px 0px 0px 0px`
    });
    if (!ui.showThumbnails) return;
    document.querySelectorAll('.thumb').forEach(thumb => {
        ui.scrollObserver.observe(thumb);
    });
}

/**
 * YouTubeの外部再生ボタンを生成する
 * @param {string} openUrl
 * @param {HTMLDivElement} thumbDiv
 * @returns {HTMLAnchorElement}
 */
function createOpenOverlay(openUrl, thumbDiv) {
    const open = document.createElement("a");
    open.href = openUrl;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.className = "open-youtube-overlay";
    open.textContent = "YouTubeで開く";
    open.title = "YouTubeで開く（開始位置から）";
    open.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const opened = window.open(openUrl, "_blank");
        if (opened) opened.opener = null;
        if (thumbDiv.classList.contains("playing") || thumbDiv.querySelector("iframe")) {
            restoreThumbnail(thumbDiv, thumbDiv.dataset.videoId || "");
        }
    });
    return open;
}

// ===== Thumbnail / Embed (public) =====

/**
 * 再生中の埋め込みを止めてサムネイルに戻す
 * @param {HTMLDivElement} thumbDiv
 * @param {string} videoId
 */
function restoreThumbnail(thumbDiv, videoId) {
    clearActiveThumb(thumbDiv);
    youtubeApi.destroyPlayer(thumbDiv);
    const iframe = thumbDiv.querySelector("iframe");
    if (iframe) iframe.src = "about:blank";
    setPlaybackState(thumbDiv, "stopped");
    if (videoId) {
        applyThumbnailImage(thumbDiv, videoId, { eager: true });
    } else {
        thumbDiv.replaceChildren();
    }
}

/**
 * 埋め込み再生を開始する
 * @param {HTMLDivElement} thumbDiv
 * @param {SongRow} row
 * @param {{videoId: string, startSeconds: number}} yt
 */
function startEmbeddedPlayback(thumbDiv, row, yt) {
    setActiveThumb(thumbDiv);
    setPlaybackState(thumbDiv, "playing");
    const ifr = document.createElement("iframe");
    // プライバシー強化モード（nocookie）を維持
    ifr.src = youtubeApi.buildEmbedUrl(yt);
    ifr.allow = "autoplay; encrypted-media";
    ifr.referrerPolicy = "strict-origin-when-cross-origin";
    ifr.allowFullscreen = true;
    // 右下の YouTube ロゴ経由だと開始秒が落ちる端末があるため、
    // 開始位置つきの外部リンク（CSVのURL）をオーバーレイとして用意する。
    const openUrl = youtubeApi.buildOpenUrl(row);
    const open = createOpenOverlay(openUrl, thumbDiv);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "thumb-close-btn";
    close.setAttribute("aria-label", "サムネイルに戻す");
    close.innerHTML = "&times;";
    close.addEventListener("click", (e) => {
        e.stopPropagation();
        restoreThumbnail(thumbDiv, yt.videoId);
    });
    if (isIOSWebKit()) {
        // iOSではiframe内の再生操作を優先する
        thumbDiv.replaceChildren(ifr, open, close);
    } else {
        const pauseOverlay = document.createElement("button");
        pauseOverlay.type = "button";
        pauseOverlay.className = "thumb-pause-overlay";
        pauseOverlay.setAttribute("aria-label", "再生を切り替える");
        pauseOverlay.addEventListener("click", (e) => {
            e.stopPropagation();
            youtubeApi.togglePlayback(thumbDiv);
        });
        thumbDiv.replaceChildren(ifr, pauseOverlay, open, close);
    }
    youtubeApi.attachPlayer(thumbDiv, ifr, yt);
}

/**
 * サムネイル表示を更新する
 * @param {HTMLDivElement} thumbDiv
 * @param {SongRow} row
 * @param {{videoId: string, startSeconds: number}} yt
 */
function updateThumbnail(thumbDiv, row, yt) {
    resetThumbnailContainer(thumbDiv, yt.videoId);

    if (!ui.showThumbnails) return;
    if (!yt.videoId) return;

    const img = createThumbnailImage(yt.videoId);
    thumbDiv.onclick = () => {
        if (thumbDiv.classList.contains("playing")) return;
        startEmbeddedPlayback(thumbDiv, row, yt);
    };
    thumbDiv.appendChild(img);
    if (shouldLoadThumbnailNow(thumbDiv)) {
        img.src = img.dataset.src;
    }
}

// ===== YouTube API (private) =====

/**
 * YouTube IFrame API関連のユーティリティ
 */

/**
 * iOS WebKit 環境か判定する
 * @returns {boolean}
 */
function isIOSWebKit() {
    const hasTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    const webkitTouchCallout = CSS.supports && CSS.supports("-webkit-touch-callout", "none");
    const webkitOverflowScrolling = CSS.supports && CSS.supports("-webkit-overflow-scrolling", "touch");
    const isWebKit = webkitTouchCallout || webkitOverflowScrolling;
    return hasTouch && isWebKit;
}

const youtubeApi = {
    /**
     * APIが利用可能か判定する
     * @returns {boolean}
     */
    isReady() {
        return Boolean(window.YT && window.YT.Player);
    },
    /**
     * APIの準備完了を待つ
     * @param {() => void} resolve
     */
    waitForReady(resolve) {
        if (this.isReady()) {
            resolve();
            return;
        }
        setTimeout(() => this.waitForReady(resolve), YT_IFRAME_READY_POLL_MS);
    },
    /**
     * APIを必要時に読み込む
     * @returns {Promise<void>}
     */
    ensureReady() {
        if (this.isReady()) return Promise.resolve();
        if (youtube.apiPromise) return youtube.apiPromise;
        youtube.apiPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector(YT_IFRAME_API_SELECTOR);
            const prevCallback = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof prevCallback === "function") prevCallback();
                resolve();
            };
            if (existing) {
                this.waitForReady(resolve);
                return;
            }
            const script = document.createElement("script");
            script.src = YT_IFRAME_API_SRC;
            script.async = true;
            script.dataset.ytIframeApi = "true";
            script.onerror = () => reject(new Error("iframe_api load failed"));
            document.head.appendChild(script);
        });
        return youtube.apiPromise;
    },
    /**
     * 埋め込みURLを組み立てる（nocookie + API有効化）
     * @param {{videoId: string, startSeconds: number}} yt
     * @returns {string}
     */
    buildEmbedUrl(yt) {
        const origin = location.origin === "null"
            ? ""
            : `&origin=${encodeURIComponent(location.origin)}`;
        return `https://www.youtube-nocookie.com/embed/${yt.videoId}?autoplay=1&playsinline=1&start=${yt.startSeconds}&enablejsapi=1&rel=0&cc_load_policy=0&iv_load_policy=3${origin}`;
    },
    /**
     * 外部再生URLを取得する
     * @param {SongRow} row
     * @returns {string}
     */
    buildOpenUrl(row) {
        return row.url;
    },
    /**
     * プレーヤーの状態変化を処理する
     * @param {HTMLDivElement} thumbDiv
     * @param {{videoId: string}} yt
     * @param {{data: number}} event
     */
    handleStateChange(thumbDiv, yt, event) {
        if (event.data === window.YT.PlayerState.PAUSED ||
            event.data === window.YT.PlayerState.ENDED) {
            setPlaybackState(thumbDiv, "paused");
            return;
        }
        if (event.data === window.YT.PlayerState.PLAYING) {
            setPlaybackState(thumbDiv, "playing");
        }
    },
    /**
     * 埋め込みプレーヤーを生成してイベントを紐づける
     * @param {HTMLDivElement} thumbDiv
     * @param {HTMLIFrameElement} iframe
     * @param {{videoId: string}} yt
     */
    attachPlayer(thumbDiv, iframe, yt) {
        this.ensureReady().then(() => {
            if (!document.body.contains(iframe)) return;
            if (youtube.players.has(thumbDiv)) return;
            const player = new window.YT.Player(iframe, {
                host: "https://www.youtube-nocookie.com",
                events: {
                    onStateChange: (event) => this.handleStateChange(thumbDiv, yt, event)
                }
            });
            youtube.players.set(thumbDiv, player);
        }).catch(() => {
            // API読み込み失敗時は埋め込みのみで継続する
        });
    },
    /**
     * 既存の埋め込みプレーヤーを破棄する
     * @param {HTMLDivElement} thumbDiv
     */
    destroyPlayer(thumbDiv) {
        const player = youtube.players.get(thumbDiv);
        if (!player) return;
        if (typeof player.destroy === "function") {
            player.destroy();
        }
        youtube.players.delete(thumbDiv);
    },
    /**
     * 埋め込みプレーヤーの再生状態を切り替える
     * @param {HTMLDivElement} thumbDiv
     */
    togglePlayback(thumbDiv) {
        const player = youtube.players.get(thumbDiv);
        if (player) {
            if (thumbDiv.classList.contains("paused") && typeof player.playVideo === "function") {
                player.playVideo();
                return;
            }
            if (thumbDiv.classList.contains("playing") && typeof player.pauseVideo === "function") {
                player.pauseVideo();
                return;
            }
        }
        if (thumbDiv.classList.contains("playing")) {
            setPlaybackState(thumbDiv, "paused");
        } else if (thumbDiv.classList.contains("paused")) {
            setPlaybackState(thumbDiv, "playing");
        }
    }
};

// ===== Utilities (private) =====

/**
 * 検索用に文字列を正規化する（全角半角・ひらがな・大文字小文字）
 * @param {string} s
 * @returns {string}
 */
function normalizeForSearch(s) {
    return (s||"")
        .normalize("NFKC")
        .replace(/[\u3041-\u3096\u309D-\u309F]/g, m => String.fromCharCode(m.charCodeAt(0) + 0x60))
        .toLowerCase();
}

/**
 * YouTube URLから動画IDと開始秒を抽出する
 * @param {string} url
 * @returns {{videoId: string, startSeconds: number}}
 */
function extractYoutubeInfo(url) {
    try {
        const u = new URL(url);
        let id = u.hostname === "youtu.be" ? u.pathname.slice(1) : (u.searchParams.get("v") || u.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] || u.pathname.match(/\/live\/([^/?#]+)/)?.[1]);
        const t = u.searchParams.get("t") || u.searchParams.get("start") || "0";
        return { videoId: id, startSeconds: parseInt(t) || 0 };
    } catch { return { videoId: "", startSeconds: 0 }; }
}

})();
