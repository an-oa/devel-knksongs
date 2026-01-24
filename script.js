(() => {
/**
 * かねきかう 歌サーチ
 */
const RANDOM_DISPLAY_COUNT = 48;
const MIN_PERFORMANCE_FOR_RANDOM = 3;
const INCREMENT_COUNT = 48;
const PUBLIC_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-cSDIsEc3sqIOkmiuuSeaUKmNb2gBvM_NoH8-Se5ZrosaSOdMhPo3RuvxhZirUPJ_ll8PGnbRnJeF/pub?gid=1763338905&single=true&output=csv";
const DEFAULT_FORMATS = ["配信", "歌みた", "ショート", "切り抜き"];
const FORMAT_PRIORITY = { "歌みた": 3, "配信": 2, "切り抜き": 1, "ショート": 0 };
const CSV_CACHE_KEY = "cachedCsv";
// Paint preview/フォーム復元の後追い対策で複数回同期する。
const UI_SYNC_PASSES = 2;
const SEARCH_DEBOUNCE_MS = 200;
const YT_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";
const YT_IFRAME_API_SELECTOR = 'script[data-yt-iframe-api="true"]';
const YT_IFRAME_READY_POLL_MS = 50;

const state = {
    data: {
        allSongsRaw: [],
        allSongsUnique: [],
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
        searchDebounceId: 0,
        cardPool: [],
        emptyStateEl: null,
        recommendedCache: null,
        activeThumb: null
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
 * @property {number} [count]
 */

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
                const img = document.createElement("img");
                img.dataset.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
                thumb.replaceChildren(img);
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
 * 再生中の埋め込みを止めてサムネイルに戻す
 * @param {HTMLDivElement} thumbDiv
 * @param {string} videoId
 */
function restoreThumbnail(thumbDiv, videoId) {
    if (ui.activeThumb === thumbDiv) ui.activeThumb = null;
    destroyEmbeddedPlayer(thumbDiv);
    const iframe = thumbDiv.querySelector("iframe");
    if (iframe) iframe.src = "about:blank";
    thumbDiv.classList.remove("playing", "paused");
    if (videoId) {
        const img = document.createElement("img");
        img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        img.dataset.src = img.src;
        thumbDiv.replaceChildren(img);
    } else {
        thumbDiv.replaceChildren();
    }
}

/**
 * UI初期化をまとめて実行する
 * @returns {Promise<void>}
 */
async function initUI() {
    resetEphemeralFilters();
    setupUIHandlers();
    setupTheme();
    setupThumbnailToggle();
    setupScrollObserver();
    setupSyncEvents();
    window.addEventListener('resize', setupScrollObserver);
    await loadInitialData();
}

document.addEventListener('DOMContentLoaded', () => {
    initUI().catch((err) => {
        console.error("initUI failed", err);
    });
});

/**
 * ブラウザのフォーム復元でフィルタ状態が残るのを防ぐ
 */
function resetEphemeralFilters() {
    resetSearchFilters();
}

/**
 * 復元タイミングに合わせたUI同期イベントを登録する
 */
function setupSyncEvents() {
    window.addEventListener('focus', scheduleSyncUiState);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === "visible") scheduleSyncUiState();
    });
    window.addEventListener("pageshow", () => {
        scheduleSyncUiState();
        scheduleDelayedVisualSync();
    });
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
    const searchBox = document.getElementById('searchBox');
    if (searchBox) searchBox.value = "";
    ui.userTouchedQuery = false;
}

/**
 * フィルタ条件を初期状態に戻す
 */
function resetSearchFilters() {
    const relayOnly = document.getElementById('relayOnly');
    const harmonyOnly = document.getElementById('harmonyOnly');
    const formatCheckboxes = document.querySelectorAll('#formatsList input[type="checkbox"]');

    if (relayOnly) relayOnly.checked = false;
    if (harmonyOnly) harmonyOnly.checked = false;

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

/**
 * UIイベント（サイドバー、検索、読み込み）を結び付ける
 */
function setupUIHandlers() {
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('open-sidebar');
    const closeBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const clearBtn = document.getElementById('clearBtn');

    openBtn.addEventListener('click', () => {
        sidebar.classList.add('active');
        overlay.classList.add('show');
    });

    const closeMenu = () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('show');
    };

    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") closeMenu();
    });

    document.getElementById('relayOnly').addEventListener('change', () => {
        ui.userTouchedFilters = true;
        ui.recommendedCache = null;
        scheduleSearch();
    });
    document.getElementById('harmonyOnly').addEventListener('change', () => {
        ui.userTouchedFilters = true;
        ui.recommendedCache = null;
        scheduleSearch();
    });
    document.getElementById('searchBox').addEventListener('input', () => {
        ui.userTouchedQuery = true;
        ui.recommendedCache = null;
        scheduleSearch();
    });

    loadMoreBtn.addEventListener('click', () => {
        data.displayLimit += INCREMENT_COUNT;
        updateDisplay();
    });

    clearBtn.addEventListener('click', clearSearch);
}

/**
 * すべての検索・フィルタ条件を初期状態にリセットする
 */
function clearSearch() {
    resetSearchConditions(true);
}

/**
 * 保存済みテーマを反映してUIを同期する
 */
function applyThemeFromStorage() {
    const themeToggle = document.getElementById('theme-toggle');
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
    const thumbToggle = document.getElementById('thumbnail-toggle');
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

/**
 * ペイント復元後のUI状態を同期する
 */
function syncUiState() {
    syncVisualUI();
    syncSearchUI();
}

/**
 * 2段階でUI状態を同期する
 */
function scheduleSyncUiState() {
    syncUiState();
    if (UI_SYNC_PASSES < 2) return;
    requestAnimationFrame(syncUiState);
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
 * 見た目系のUIを同期する
 */
function syncVisualUI() {
    syncThemeUI();
    syncThumbnailUI();
}

/**
 * 復元直後の描画ズレを緩和するために再同期を遅らせる
 * @param {number} [delayMs]
 */
function scheduleDelayedVisualSync(delayMs) {
    const delay = Number.isFinite(delayMs) ? delayMs : 200;
    setTimeout(syncVisualUI, delay);
}

/**
 * 形態フィルタが初期状態か判定する
 * @returns {boolean}
 */
function areFormatsDefault() {
    if (ui.selectedFormats.size !== DEFAULT_FORMATS.length) return false;
    return DEFAULT_FORMATS.every(f => ui.selectedFormats.has(f));
}

/**
 * フィルタが初期状態からずれているか判定する
 * @returns {boolean}
 */
function needsFilterReset() {
    const relayOnly = document.getElementById('relayOnly');
    const harmonyOnly = document.getElementById('harmonyOnly');
    if (relayOnly && relayOnly.checked) return true;
    if (harmonyOnly && harmonyOnly.checked) return true;
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
    const searchBox = document.getElementById('searchBox');
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

/**
 * テーマトグルの初期化とイベント設定
 */
function setupTheme() {
    const themeToggle = document.getElementById('theme-toggle');
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
    const thumbToggle = document.getElementById('thumbnail-toggle');
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

/**
 * CSVを読み込み、初期データとフィルタを構築する
 */
async function loadInitialData() {
    const resCount = document.getElementById("resultCount");
    try {
        resCount.innerText = "データを読み込み中...";
        const res = await fetch(PUBLIC_CSV_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const csvText = await res.text();
        localStorage.setItem(CSV_CACHE_KEY, csvText);
        data.allSongsRaw = parseCsvToSongs(csvText);
        initFilterMenu();
        data.allSongsUnique = generateUniqueList(data.allSongsRaw);
        ui.recommendedCache = null;
        document.getElementById('searchBox').disabled = false;
        ui.dataReady = true;
        resetSearchConditions(false);
        scheduleSearch({ immediate: true });
        requestAnimationFrame(() => ensureYouTubeApi().catch(() => {}));
    } catch (e) {
        const cached = localStorage.getItem(CSV_CACHE_KEY);
        if (cached) {
            data.allSongsRaw = parseCsvToSongs(cached);
            initFilterMenu();
            data.allSongsUnique = generateUniqueList(data.allSongsRaw);
            ui.recommendedCache = null;
            document.getElementById('searchBox').disabled = false;
            resCount.innerText = "キャッシュを表示中";
            ui.dataReady = true;
            resetSearchConditions(false);
            scheduleSearch({ immediate: true });
            requestAnimationFrame(() => ensureYouTubeApi().catch(() => {}));
        } else {
            resCount.innerText = "読込エラー";
        }
    }
}

/**
 * 形態フィルタのチェックボックス一覧を生成する
 */
function initFilterMenu() {
    const container = document.getElementById('formatsList');
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
        });
        label.append(cb, " " + fmt);
        container.appendChild(label);
    });
}

/**
 * 検索条件の現在値を取得する
 * @returns {{queryRaw: string, relayOnly: boolean, harmonyOnly: boolean}}
 */
function getSearchState() {
    return {
        queryRaw: document.getElementById('searchBox').value.trim(),
        relayOnly: document.getElementById('relayOnly').checked,
        harmonyOnly: document.getElementById('harmonyOnly').checked
    };
}

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
 * おすすめ表示条件を満たしているか判定する
 * @param {{queryRaw: string, relayOnly: boolean, harmonyOnly: boolean}} searchState
 * @returns {boolean}
 */
function isRecommendedMode(searchState) {
    return searchState.queryRaw === "" &&
           !searchState.relayOnly &&
           !searchState.harmonyOnly &&
           DEFAULT_FORMATS.every(f => ui.selectedFormats.has(f));
}

/**
 * 検索条件で楽曲を絞り込む
 * @param {{queryRaw: string, relayOnly: boolean, harmonyOnly: boolean}} searchState
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
        return matchText && ui.selectedFormats.has(row.format) && (!searchState.relayOnly || row.isRelay) && (!searchState.harmonyOnly || row.isHarmony);
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
 * 形態の優先度を取得する
 * @param {string} format
 * @returns {number}
 */
function getFormatPriority(format) {
    return Object.prototype.hasOwnProperty.call(FORMAT_PRIORITY, format) ? FORMAT_PRIORITY[format] : -1;
}

/**
 * CSVの並び順で新しさを判定するための値
 * @param {SongRow} row
 * @returns {number}
 */
function getRowOrderKey(row) {
    return Number.isFinite(row.sourceIndex) ? row.sourceIndex : Number.MAX_SAFE_INTEGER;
}

/**
 * 優先度とCSV順で表示候補を比較する
 * @param {SongRow} nextRow
 * @param {SongRow} currentRow
 * @returns {boolean}
 */
function isPreferredRow(nextRow, currentRow) {
    const nextPriority = getFormatPriority(nextRow.format);
    const currentPriority = getFormatPriority(currentRow.format);
    if (nextPriority !== currentPriority) {
        return nextPriority > currentPriority;
    }
    return getRowOrderKey(nextRow) < getRowOrderKey(currentRow);
}

/**
 * おすすめ表示用の楽曲を抽出する
 * @returns {Array<SongRow>}
 */
function pickRecommended() {
    if (ui.recommendedCache) return ui.recommendedCache;
    const popular = data.allSongsUnique.filter(s => (s.count || 0) >= MIN_PERFORMANCE_FOR_RANDOM);
    const shuffled = shuffleInPlace(popular);
    ui.recommendedCache = shuffled.slice(0, RANDOM_DISPLAY_COUNT);
    return ui.recommendedCache;
}

/**
 * 検索条件に応じて結果を更新する
 */
function search() {
    const searchState = getSearchState();
    const resCount = document.getElementById("resultCount");

    if (isRecommendedMode(searchState)) {
        data.currentResults = pickRecommended();
        data.displayLimit = RANDOM_DISPLAY_COUNT;
        resCount.innerText = "おすすめを表示中";
    } else {
        data.currentResults = filterSongs(searchState);
        data.displayLimit = INCREMENT_COUNT;
        resCount.innerText = `${data.currentResults.length} 件がヒット`;
    }
    updateDisplay();
}

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

/**
 * YouTube IFrame APIの準備完了を判定する
 * @returns {boolean}
 */
function isYouTubeApiReady() {
    return Boolean(window.YT && window.YT.Player);
}

/**
 * YouTube IFrame APIの準備完了を待つ
 * @param {() => void} resolve
 */
function waitForYouTubeApi(resolve) {
    if (isYouTubeApiReady()) {
        resolve();
        return;
    }
    setTimeout(() => waitForYouTubeApi(resolve), YT_IFRAME_READY_POLL_MS);
}

/**
 * YouTube IFrame APIを必要時に読み込む
 * @returns {Promise<void>}
 */
function ensureYouTubeApi() {
    if (isYouTubeApiReady()) return Promise.resolve();
    if (youtube.apiPromise) return youtube.apiPromise;
    youtube.apiPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(YT_IFRAME_API_SELECTOR);
        if (existing) {
            waitForYouTubeApi(resolve);
            return;
        }
        const script = document.createElement("script");
        script.src = YT_IFRAME_API_SRC;
        script.async = true;
        script.dataset.ytIframeApi = "true";
        script.onerror = () => reject(new Error("iframe_api load failed"));
        const prevCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof prevCallback === "function") prevCallback();
            resolve();
        };
        document.head.appendChild(script);
    });
    return youtube.apiPromise;
}

/**
 * 埋め込みURLを組み立てる（nocookie + API有効化）
 * @param {{videoId: string, startSeconds: number}} yt
 * @returns {string}
 */
function buildYouTubeEmbedUrl(yt) {
    return `https://www.youtube-nocookie.com/embed/${yt.videoId}?autoplay=1&playsinline=1&start=${yt.startSeconds}&enablejsapi=1`;
}

/**
 * プレーヤーの状態変化を処理する
 * @param {HTMLDivElement} thumbDiv
 * @param {{videoId: string}} yt
 * @param {{data: number}} event
 */
function handleYouTubePlayerStateChange(thumbDiv, yt, event) {
    if (event.data === window.YT.PlayerState.PAUSED ||
        event.data === window.YT.PlayerState.ENDED) {
        thumbDiv.classList.remove("playing");
        thumbDiv.classList.add("paused");
        return;
    }
    if (event.data === window.YT.PlayerState.PLAYING) {
        thumbDiv.classList.remove("paused");
        thumbDiv.classList.add("playing");
    }
}

/**
 * 埋め込みプレーヤーを生成してイベントを紐づける
 * @param {HTMLDivElement} thumbDiv
 * @param {HTMLIFrameElement} iframe
 * @param {{videoId: string}} yt
 */
function attachEmbeddedPlayer(thumbDiv, iframe, yt) {
    ensureYouTubeApi().then(() => {
        if (!document.body.contains(iframe)) return;
        if (youtube.players.has(thumbDiv)) return;
        const player = new window.YT.Player(iframe, {
            host: "https://www.youtube-nocookie.com",
            events: {
                onStateChange: (event) => handleYouTubePlayerStateChange(thumbDiv, yt, event)
            }
        });
        youtube.players.set(thumbDiv, player);
    }).catch(() => {
        // API読み込み失敗時は埋め込みのみで継続する
    });
}

/**
 * 既存の埋め込みプレーヤーを破棄する
 * @param {HTMLDivElement} thumbDiv
 */
function destroyEmbeddedPlayer(thumbDiv) {
    const player = youtube.players.get(thumbDiv);
    if (!player) return;
    if (typeof player.destroy === "function") {
        player.destroy();
    }
    youtube.players.delete(thumbDiv);
}

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
 * YouTubeの外部再生URLを組み立てる
 * @param {SongRow} row
 * @param {{videoId: string, startSeconds: number}} yt
 * @returns {string}
 */
function buildYouTubeOpenUrl(row, yt) {
    return row.url || `https://www.youtube.com/watch?v=${yt.videoId}&t=${yt.startSeconds}s`;
}

/**
 * 埋め込み再生を開始する
 * @param {HTMLDivElement} thumbDiv
 * @param {SongRow} row
 * @param {{videoId: string, startSeconds: number}} yt
 */
function startEmbeddedPlayback(thumbDiv, row, yt) {
    if (ui.activeThumb && ui.activeThumb !== thumbDiv) {
        restoreThumbnail(ui.activeThumb, ui.activeThumb.dataset.videoId || "");
    }
    ui.activeThumb = thumbDiv;
    thumbDiv.classList.add("playing");
    const ifr = document.createElement("iframe");
    // プライバシー強化モード（nocookie）を維持
    ifr.src = buildYouTubeEmbedUrl(yt);
    ifr.allow = "autoplay; encrypted-media";
    ifr.referrerPolicy = "strict-origin-when-cross-origin";
    ifr.allowFullscreen = true;
    // 右下の YouTube ロゴ経由だと開始秒が落ちる端末があるため、
    // 開始位置つきの外部リンク（CSVのURL）をオーバーレイとして用意する。
    const openUrl = buildYouTubeOpenUrl(row, yt);
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
    const pauseOverlay = document.createElement("button");
    pauseOverlay.type = "button";
    pauseOverlay.className = "thumb-pause-overlay";
    pauseOverlay.setAttribute("aria-label", "再生を切り替える");
    pauseOverlay.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleEmbeddedPlayback(thumbDiv);
    });
    thumbDiv.replaceChildren(ifr, pauseOverlay, open, close);
    attachEmbeddedPlayer(thumbDiv, ifr, yt);
}

/**
 * 埋め込みプレーヤーの再生状態を切り替える
 * @param {HTMLDivElement} thumbDiv
 */
function toggleEmbeddedPlayback(thumbDiv) {
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
        thumbDiv.classList.remove("playing");
        thumbDiv.classList.add("paused");
    } else if (thumbDiv.classList.contains("paused")) {
        thumbDiv.classList.remove("paused");
        thumbDiv.classList.add("playing");
    }
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

/**
 * フッター用のタグ群を更新する
 * @param {HTMLDivElement} tags
 * @param {SongRow} row
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
 * 検索結果が空のときに使う要素を取得する
 * @returns {HTMLDivElement}
 */
function getEmptyStateElement() {
    if (ui.emptyStateEl) return ui.emptyStateEl;
    const empty = document.createElement("div");
    empty.style.gridColumn = "1/-1";
    empty.style.textAlign = "center";
    empty.style.padding = "50px";
    empty.style.color = "var(--text-mute)";
    empty.textContent = "見つかりませんでした";
    ui.emptyStateEl = empty;
    return ui.emptyStateEl;
}

/**
 * 現在の検索結果をカードとして描画する
 */
function updateDisplay() {
    const container = document.getElementById("resultList");
    const loadMoreContainer = document.getElementById('loadMoreContainer');

    if (ui.scrollObserver) ui.scrollObserver.disconnect();
    if (ui.showThumbnails && !ui.scrollObserver) setupScrollObserver();

    const results = data.currentResults.slice(0, data.displayLimit);

    if (results.length === 0) {
        container.replaceChildren(getEmptyStateElement());
        loadMoreContainer.classList.add('hidden');
        return;
    }

    const nodes = [];
    for (let i = 0; i < results.length; i++) {
        if (!ui.cardPool[i]) ui.cardPool[i] = createCardElements();
        const entry = ui.cardPool[i];
        updateCardFromRow(entry, results[i]);
        nodes.push(entry.card);
    }

    container.replaceChildren(...nodes);
    if (ui.showThumbnails && ui.scrollObserver) {
        for (let i = 0; i < results.length; i++) {
            ui.scrollObserver.observe(ui.cardPool[i].thumbDiv);
        }
    }

    const recommendedMode = isRecommendedMode(getSearchState());

    if (!recommendedMode && data.currentResults.length > data.displayLimit) {
        loadMoreContainer.classList.remove('hidden');
    } else {
        loadMoreContainer.classList.add('hidden');
    }
}

/**
 * CSVテキストを曲データの配列に変換する
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
    const idx = (n) => header.indexOf(n);
    const songs = [];
    for (let i = 0; i < body.length; i++) {
        const r = body[i];
        const memo = r[idx("メモ")] || "";
        const memoUpper = memo.toUpperCase();
        const memoAllows = !memoUpper.includes("URL") && !memoUpper.includes("URI");
        if (r[idx("公開範囲")] !== "全体" || !r[idx("#")] || !memoAllows) continue;
        const title = r[idx("曲名")];
        const artist = r[idx("アーティスト名")];
        const titleYomi = r[idx("キョクメイ")];
        const artistYomi = r[idx("アーティストメイ")];
        songs.push({
            date: r[idx("配信日")],
            sourceIndex: i,
            format: r[idx("形態")],
            isRelay: r[idx("歌枠リレー？")] === "◯",
            isHarmony: r[idx("ハモリあり？")] === "◯",
            title,
            artist,
            titleYomi,
            artistYomi,
            url: r[idx("URL")],
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
    for (let i=0; i<t.length; i++) {
        let c = t[i];
        if (inQ) { if(c==='"' && t[i+1]==='"'){ field+='"'; i++; } else if(c==='"'){ inQ=false; } else { field+=c; } }
        else { if(c==='"'){ inQ=true; } else if(c===','){ row.push(field); field=""; } else if(c==='\n'||c==='\r'){ row.push(field); res.push(row); row=[]; field=""; if(c==='\r'&&t[i+1]==='\n')i++; } else { field+=c; } }
    }
    row.push(field); res.push(row);
    while (res.length > 0 && res[res.length - 1].every(v => v === "")) {
        res.pop();
    }
    return res;
}

/**
 * 曲名とアーティストで重複をまとめ、優先度とCSV順で表示候補を決める
 * @param {Array<SongRow>} raw
 * @returns {Array<SongRow>}
 */
function generateUniqueList(raw) {
    const map = new Map();
    raw.forEach(r => {
        const key = (r.title||'') + '|||' + (r.artist||'');
        if (!map.has(key)) map.set(key, { count: 1, data: r });
        else {
            const e = map.get(key);
            e.count++;
            if (isPreferredRow(r, e.data)) e.data = r;
        }
    });
    return Array.from(map.values()).map(e => ({...e.data, count: e.count}));
}

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
