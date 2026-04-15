/**
 * 鐘輝かう 歌サーチ
 */
export const RANDOM_DISPLAY_COUNT = 48;
export const MIN_PERFORMANCE_FOR_RANDOM = 3;
export const INCREMENT_COUNT = 48;
export const PUBLIC_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-cSDIsEc3sqIOkmiuuSeaUKmNb2gBvM_NoH8-Se5ZrosaSOdMhPo3RuvxhZirUPJ_ll8PGnbRnJeF/pub?gid=457223586&single=true&output=csv";
export const DEFAULT_FORMATS = ["配信", "歌みた", "ショート", "切り抜き"];
export const CSV_CACHE_KEY = "cachedCsv";
export const SEARCH_STATE_KEY = "searchStateV1";
export const BOOKMARK_STORAGE_KEY = "bookmarksV1";
export const BOOKMARK_STORAGE_VERSION = 2;
export const MAX_BOOKMARK_COUNT = 20;
export const MAX_SONGS_PER_BOOKMARK = 120;
// Paint preview/フォーム復元の後追い対策で複数回同期する。
export const UI_SYNC_PASSES = 2;
export const SEARCH_DEBOUNCE_MS = 200;
export const YT_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";
export const YT_IFRAME_API_SELECTOR = 'script[data-yt-iframe-api="true"]';
export const YT_IFRAME_READY_POLL_MS = 50;
export const STOP_PLAYBACK_ON_SCROLL_OUT = false;

export const state = {
    data: {
        allSongsRaw: [],
        currentResults: [],
        displayLimit: RANDOM_DISPLAY_COUNT,
        bookmarks: {},
        activeBookmark: null
    },
    ui: {
        el: {}, // DOM要素のキャッシュ用
        search: {
            selectedFormats: new Set(),
            dataReady: false,
            userTouchedQuery: false,
            userTouchedFilters: false,
            hasRestoredSearchState: false,
            debounceId: 0,
            recommendedCache: null
        },
        date: {
            bounds: null,
            index: null,
            pendingValues: null
        },
        playback: {
            scrollObserver: null,
            showThumbnails: false,
            stopAtEndTime: false,
            continuousPlayback: false,
            loopPlayback: false,
            activeThumb: null
        },
        lookup: {
            songMapByBookmarkKey: new Map(),
            songMapByKey: new Map(),
            songMapByLegacyIndex: new Map(),
            songLookupSourceRef: null
        },
        render: {
            cardEntriesBySourceKey: new Map()
        },
        settingsPanel: {
            returnFocusEl: null
        },
        bookmarkPanel: {
            pendingAction: null,
            returnFocusEl: null,
            exitClosesSidebar: false
        }
    },
    youtube: {
        apiPromise: null,
        players: new WeakMap()
    }
};

export const data = state.data;
export const ui = state.ui;
export const youtube = state.youtube;
