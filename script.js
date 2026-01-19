/**
 * かねきかう 歌サーチ
 */
const RANDOM_DISPLAY_COUNT = 48;
const MIN_PERFORMANCE_FOR_RANDOM = 3;
const INCREMENT_COUNT = 48;
const PUBLIC_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-cSDIsEc3sqIOkmiuuSeaUKmNb2gBvM_NoH8-Se5ZrosaSOdMhPo3RuvxhZirUPJ_ll8PGnbRnJeF/pub?gid=1962692986&single=true&output=csv";
const DEFAULT_FORMATS = ["配信", "動画", "ショート", "切り抜き"];
const CSV_CACHE_KEY = "cachedCsv";

let allSongsRaw = [];
let allSongsUnique = [];
let currentResults = [];
let displayLimit = RANDOM_DISPLAY_COUNT;
let selectedFormats = new Set();
let scrollObserver;
let showThumbnails = false;

/**
 * IntersectionObserverの通知でサムネ読み込みと再生停止を制御する
 * @param {IntersectionObserverEntry[]} entries
 */
function handleScrollObserver(entries) {
    entries.forEach(entry => {
        const thumb = entry.target.querySelector('.thumb');
        if (!thumb) return;
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
    if (scrollObserver) scrollObserver.disconnect();
    scrollObserver = new IntersectionObserver(handleScrollObserver, {
        threshold: 0,
        rootMargin: `-${headerHeight}px 0px 0px 0px`
    });
    if (!showThumbnails) return;
    document.querySelectorAll('.song-card').forEach(card => {
        if (card.querySelector('.thumb')) scrollObserver.observe(card);
    });
}

/**
 * 再生中の埋め込みを止めてサムネイルに戻す
 * @param {HTMLDivElement} thumbDiv
 * @param {string} videoId
 */
function restoreThumbnail(thumbDiv, videoId) {
    const iframe = thumbDiv.querySelector("iframe");
    if (iframe) iframe.src = "about:blank";
    thumbDiv.classList.remove("playing");
    if (videoId) {
        const img = document.createElement("img");
        img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        img.dataset.src = img.src;
        thumbDiv.replaceChildren(img);
    } else {
        thumbDiv.replaceChildren();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    resetEphemeralFilters();
    setupUIHandlers();
    setupTheme();
    setupThumbnailToggle();
    setupScrollObserver();
    window.addEventListener('resize', setupScrollObserver);
    await loadInitialData();
});

window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
        resetEphemeralFilters();
        setupTheme();
    }
});

/**
 * ブラウザのフォーム復元でチェック状態が残るのを防ぐ
 */
function resetEphemeralFilters() {
    const relayOnly = document.getElementById('relayOnly');
    const harmonyOnly = document.getElementById('harmonyOnly');
    if (relayOnly) relayOnly.checked = false;
    if (harmonyOnly) harmonyOnly.checked = false;
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

    document.getElementById('relayOnly').onchange = search;
    document.getElementById('harmonyOnly').onchange = search;
    document.getElementById('searchBox').oninput = search;

    loadMoreBtn.addEventListener('click', () => {
        displayLimit += INCREMENT_COUNT;
        updateDisplay();
    });

    clearBtn.addEventListener('click', clearSearch);
}

/**
 * すべての検索・フィルタ条件を初期状態にリセットする
 */
function clearSearch() {
    const searchBox = document.getElementById('searchBox');
    const relayOnly = document.getElementById('relayOnly');
    const harmonyOnly = document.getElementById('harmonyOnly');
    const formatCheckboxes = document.querySelectorAll('#formatsList input[type="checkbox"]');

    searchBox.value = "";
    relayOnly.checked = false;
    harmonyOnly.checked = false;
    selectedFormats.clear();
    DEFAULT_FORMATS.forEach(f => selectedFormats.add(f));
    formatCheckboxes.forEach(cb => { cb.checked = true; });

    search();
}

/**
 * テーマ初期設定
 * 1. ユーザーが手動で設定した記録があればそれを優先
 * 2. 記録がなければOSのダークモード設定に従う
 */
function setupTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    let isDarkMode = savedTheme ? (savedTheme === 'dark') : systemPrefersDark;

    if (isDarkMode) {
        document.body.classList.add('dark-theme');
        themeToggle.checked = true;
    }

    themeToggle.addEventListener('change', () => {
        const isDarkNow = themeToggle.checked;
        document.body.classList.toggle('dark-theme', isDarkNow);
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
    showThumbnails = isShow;

    thumbToggle.checked = isShow;
    if (!isShow) document.body.classList.add('hide-thumbs');

    thumbToggle.addEventListener('change', () => {
        const checked = thumbToggle.checked;
        showThumbnails = checked;
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
        allSongsRaw = parseCsvToSongs(csvText);
        initFilterMenu();
        allSongsUnique = generateUniqueList(allSongsRaw);
        document.getElementById('searchBox').disabled = false;
        search();
    } catch (e) {
        const cached = localStorage.getItem(CSV_CACHE_KEY);
        if (cached) {
            allSongsRaw = parseCsvToSongs(cached);
            initFilterMenu();
            allSongsUnique = generateUniqueList(allSongsRaw);
            document.getElementById('searchBox').disabled = false;
            resCount.innerText = "キャッシュを表示中";
            search();
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
        selectedFormats.add(fmt);
        cb.addEventListener('change', (e) => {
            if (e.target.checked) selectedFormats.add(e.target.value);
            else selectedFormats.delete(e.target.value);
            search();
        });
        label.append(cb, " " + fmt);
        container.appendChild(label);
    });
}

/**
 * 入力条件に応じて検索結果を更新し、表示を再描画する
 */
function search() {
    const queryRaw = document.getElementById('searchBox').value.trim();
    const queryNorm = normalizeForSearch(queryRaw);
    const relayOnly = document.getElementById('relayOnly').checked;
    const harmonyOnly = document.getElementById('harmonyOnly').checked;
    const resCount = document.getElementById("resultCount");

    const isRecommendedMode = queryRaw === "" && !relayOnly && !harmonyOnly && DEFAULT_FORMATS.every(f => selectedFormats.has(f));

    if (isRecommendedMode) {
        const popular = allSongsUnique.filter(s => (s.count || 0) >= MIN_PERFORMANCE_FOR_RANDOM);
        currentResults = popular.sort(() => Math.random() - 0.5).slice(0, RANDOM_DISPLAY_COUNT);
        displayLimit = RANDOM_DISPLAY_COUNT;
        resCount.innerText = "おすすめを表示中";
    } else {
        const keywords = queryNorm.split(/[\s\u3000]+/).filter(k => k.length > 0);
        currentResults = allSongsRaw.filter(row => {
            const matchText = keywords.every(kw =>
                row.titleNorm.includes(kw) ||
                row.artistNorm.includes(kw) ||
                row.titleYomiNorm.includes(kw) ||
                row.artistYomiNorm.includes(kw)
            );
            return matchText && selectedFormats.has(row.format) && (!relayOnly || row.isRelay) && (!harmonyOnly || row.isHarmony);
        }).sort((a, b) => b.date.localeCompare(a.date));
        displayLimit = INCREMENT_COUNT;
        resCount.innerText = `${currentResults.length} 件がヒット`;
    }
    updateDisplay();
}

/**
 * 現在の検索結果をカードとして描画する
 */
function renderCard(row) {
    const card = document.createElement("div");
    card.className = "song-card";
    const yt = extractYoutubeInfo(row.url);
    let thumbDiv = null;
    if (showThumbnails) {
        thumbDiv = document.createElement("div");
        thumbDiv.className = "thumb";
        thumbDiv.dataset.videoId = yt.videoId;

        if (yt.videoId) {
            const img = document.createElement("img");
            img.dataset.src = `https://i.ytimg.com/vi/${yt.videoId}/mqdefault.jpg`;
            thumbDiv.onclick = () => {
                if (thumbDiv.classList.contains("playing")) return;
                thumbDiv.classList.add("playing");
                const ifr = document.createElement("iframe");
                // プライバシー強化モード（nocookie）を維持
                ifr.src = `https://www.youtube-nocookie.com/embed/${yt.videoId}?autoplay=1&playsinline=1&start=${yt.startSeconds}`;
                ifr.allow = "autoplay; encrypted-media";
                ifr.referrerPolicy = "strict-origin-when-cross-origin";
                ifr.allowFullscreen = true;
                // 右下の YouTube ロゴ経由だと開始秒が落ちる端末があるため、
                // 開始位置つきの外部リンク（CSVのURL）をオーバーレイとして用意する。
                const open = document.createElement("a");
                open.href = row.url || `https://www.youtube.com/watch?v=${yt.videoId}&t=${yt.startSeconds}s`;
                open.target = "_blank";
                open.rel = "noopener noreferrer";
                open.className = "open-youtube-overlay";
                open.textContent = "YouTubeで開く";
                open.title = "YouTubeで開く（開始位置から）";
                open.addEventListener("click", (e) => {
                    e.stopPropagation();
                    restoreThumbnail(thumbDiv, yt.videoId);
                });

                const close = document.createElement("button");
                close.type = "button";
                close.className = "thumb-close-btn";
                close.setAttribute("aria-label", "サムネイルに戻す");
                close.innerHTML = "&times;";
                close.addEventListener("click", (e) => {
                    e.stopPropagation();
                    restoreThumbnail(thumbDiv, yt.videoId);
                });

                thumbDiv.replaceChildren(ifr, open, close);
            };
            thumbDiv.appendChild(img);
        }
    }

    const content = document.createElement("div");
    content.className = "content";
    const title = document.createElement(row.url ? "a" : "div");
    title.className = row.url ? "title title-link" : "title";
    title.textContent = row.title || "無題";
    if (row.url) {
        title.href = row.url;
        title.target = "_blank";
        title.rel = "noopener noreferrer";
    }

    const artist = document.createElement("div");
    artist.className = "artist";
    artist.textContent = row.artist || "不明";

    const footer = document.createElement("div");
    footer.className = "card-footer";

    const leftGroup = document.createElement("div");
    leftGroup.className = "footer-left";
    const date = document.createElement("span");
    date.textContent = row.date;
    leftGroup.append(date);

    const rightGroup = document.createElement("div");
    rightGroup.className = "footer-right";

    const tags = document.createElement("div");
    tags.className = "footer-tags";
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

    rightGroup.append(tags);
    footer.append(leftGroup, rightGroup);
    content.append(title, artist, footer);
    if (thumbDiv) card.append(thumbDiv);
    card.append(content);

    return { card, thumbDiv };
}

function updateDisplay() {
    const container = document.getElementById("resultList");
    const loadMoreContainer = document.getElementById('loadMoreContainer');

    if (showThumbnails) {
        if (!scrollObserver) setupScrollObserver();
        scrollObserver.disconnect();
    }
    const results = currentResults.slice(0, displayLimit);
    container.innerHTML = "";

    if (results.length === 0) {
        const empty = document.createElement("div");
        empty.style.gridColumn = "1/-1";
        empty.style.textAlign = "center";
        empty.style.padding = "50px";
        empty.style.color = "var(--text-mute)";
        empty.textContent = "見つかりませんでした";
        container.replaceChildren(empty);
        loadMoreContainer.classList.add('hidden');
        return;
    }

    results.forEach(row => {
        const { card, thumbDiv } = renderCard(row);
        container.appendChild(card);
        if (showThumbnails && thumbDiv) scrollObserver.observe(card);
    });

    const isRecommendedMode = document.getElementById('searchBox').value.trim() === "" &&
                             !document.getElementById('relayOnly').checked &&
                             !document.getElementById('harmonyOnly').checked &&
                             DEFAULT_FORMATS.every(f => selectedFormats.has(f));

    if (!isRecommendedMode && currentResults.length > displayLimit) {
        loadMoreContainer.classList.remove('hidden');
    } else {
        loadMoreContainer.classList.add('hidden');
    }
}

/**
 * CSVテキストを曲データの配列に変換する
 * @param {string} csvText
 * @returns {Array<Object>}
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
    return body.filter(r => {
        const memo = r[idx("メモ")] || "";
        const memoUpper = memo.toUpperCase();
        const memoAllows = !memoUpper.includes("URL") && !memoUpper.includes("URI");
        return r[idx("公開範囲")] === "全体" && r[idx("#")] && memoAllows;
    }).map(r => {
        const title = r[idx("曲名")];
        const artist = r[idx("アーティスト名")];
        const titleYomi = r[idx("キョクメイ")];
        const artistYomi = r[idx("アーティストメイ")];
        return {
            date: r[idx("配信日")],
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
        };
    });
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
 * 曲名とアーティストで重複をまとめ、最新のデータを保持する
 * @param {Array<Object>} raw
 * @returns {Array<Object>}
 */
function generateUniqueList(raw) {
    const map = new Map();
    raw.forEach(r => {
        const key = (r.title||'') + '|||' + (r.artist||'');
        if (!map.has(key)) map.set(key, { latest: r.date, count: 1, data: r });
        else { const e = map.get(key); e.count++; if(r.date > e.latest){ e.latest = r.date; e.data = r; } }
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
