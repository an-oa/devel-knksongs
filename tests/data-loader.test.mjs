import test from "node:test";
import assert from "node:assert/strict";
import { createDataLoader } from "../app/ui/core/data.mjs";
import { buildSongsJsonMetaPayload, buildSongsJsonPayload } from "../app/lib/songs-json.mjs";
import { installFakeDom } from "./test-helpers.mjs";

function createFakeLocalStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
}

function createFakeSongsJsonCacheStore(initialValue = null) {
    let value = initialValue;
    return {
        async getText() {
            return value;
        },
        async setText(nextValue) {
            value = String(nextValue);
            return true;
        },
        async removeText() {
            value = null;
        },
        peek() {
            return value;
        }
    };
}

/**
 * data loader テスト用の最小 CSV を返す。
 * @returns {string}
 */
function createValidCsv() {
    return [
        "#,配信日,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        "archive-1,2026/03/11,縦,全体,配信,,,1,KING,Kanaria feat. GUMI,キング,カナリアフィーチャリンググミ,https://www.youtube.com/watch?v=abc123&t=10s,0:09:41,"
    ].join("\n");
}

/**
 * data loader テスト用のJSON文字列を返す。
 * @param {string} songKey
 * @param {string} [contentHash]
 * @returns {string}
 */
function createSongsJson(songKey, contentHash = `sha256:${songKey}`) {
    const archiveId = songKey.split("::")[0] || "json-archive";
    return JSON.stringify(buildSongsJsonPayload([
        {
            date: "2026/03/11",
            dateKey: 20260311,
            archiveId,
            archiveOrder: 1,
            sourceIndex: 0,
            videoId: "abc123",
            songKey,
            bookmarkSongKey: `abc123::${songKey}`,
            legacySongKey: `${songKey}::https://www.youtube.com/watch?v=abc123&t=10s`,
            format: "配信",
            videoOrientation: "vertical",
            isRelay: false,
            isHarmony: false,
            title: "KING",
            artist: "Kanaria feat. GUMI",
            titleYomi: "キング",
            artistYomi: "カナリアフィーチャリンググミ",
            url: "https://www.youtube.com/watch?v=abc123&t=10s",
            endSeconds: 581,
            titleNorm: "king",
            artistNorm: "kanaria feat. gumi",
            titleYomiNorm: "キング",
            artistYomiNorm: "カナリアフィーチャリンググミ"
        }
    ], contentHash));
}

/**
 * data loader テスト用のJSONメタ情報を返す。
 * @param {string} contentHash
 * @returns {string}
 */
function createSongsMetaJson(contentHash) {
    return JSON.stringify(buildSongsJsonMetaPayload(contentHash));
}

/**
 * 保留中のPromise継続を進める。
 * @returns {Promise<void>}
 */
function waitForAsyncWork() {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

/**
 * data loader テスト用の状態とスパイを作る。
 * @param {*} input
 * @returns {*}
 */
function createDataLoaderHarness(input) {
    const options = input || {};
    const resultCount = document.createElement("div");
    const searchBox = document.createElement("input");
    searchBox.disabled = options.searchBoxDisabled ?? true;

    const data = {
        allSongsRaw: []
    };
    const ui = {
        el: {
            resultCount,
            searchBox
        },
        search: {
            recommendedCache: options.recommendedCache ?? { stale: true },
            dataReady: false,
            hasRestoredSearchState: options.hasRestoredSearchState ?? false
        },
        date: {
            pendingValues: options.pendingValues ?? null
        }
    };

    const calls = {
        migrateLegacyBookmarkSongRefs: 0,
        applyDateInputRangeArgs: [],
        clampDateInputsToBoundsArgs: [],
        resetSearchConditionsArgs: [],
        scheduleSearchArgs: []
    };

    const callbacks = {
        migrateLegacyBookmarkSongRefs() {
            calls.migrateLegacyBookmarkSongRefs += 1;
        },
        applyDateInputRange(songs) {
            calls.applyDateInputRangeArgs.push(songs);
            return options.dateBounds ?? { minKey: 20260311, maxKey: 20260311 };
        },
        clampDateInputsToBounds(minKey, maxKey) {
            calls.clampDateInputsToBoundsArgs.push([minKey, maxKey]);
        },
        resetSearchConditions(shouldSearch) {
            calls.resetSearchConditionsArgs.push(shouldSearch);
        },
        scheduleSearch(optionsArg) {
            calls.scheduleSearchArgs.push(optionsArg);
        }
    };

    return { data, ui, calls, callbacks };
}

test("data loader: fetch success stores csv, enables search, and schedules initial search", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const csv = createValidCsv();
        const { data, ui, calls, callbacks } = createDataLoaderHarness();
        globalThis.fetch = async (url, options) => {
            assert.equal(url, "https://example.test/songs.csv");
            assert.deepEqual(options, { cache: "no-store" });
            return {
                ok: true,
                async text() {
                    return csv;
                }
            };
        };

        const loader = createDataLoader({
            data,
            ui,
            publicCsvUrl: "https://example.test/songs.csv",
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();

        assert.equal(globalThis.localStorage.getItem("cachedCsv"), csv);
        assert.equal(data.allSongsRaw.length, 1);
        assert.equal(data.allSongsRaw[0].songKey, "archive-1::1");
        assert.equal(calls.migrateLegacyBookmarkSongRefs, 1);
        assert.equal(calls.applyDateInputRangeArgs.length, 1);
        assert.equal(calls.applyDateInputRangeArgs[0], data.allSongsRaw);
        assert.deepEqual(calls.clampDateInputsToBoundsArgs, [[20260311, 20260311]]);
        assert.deepEqual(calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }]);
        assert.equal(ui.search.recommendedCache, null);
        assert.equal(ui.search.dataReady, true);
        assert.equal(ui.el.searchBox.disabled, false);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        restoreDom();
    }
});

test("data loader: json fetch success stores songs json and skips csv fetch", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const songsJson = createSongsJson("json-archive::1");
        const songsJsonCache = createFakeSongsJsonCacheStore();
        const { data, ui, calls, callbacks } = createDataLoaderHarness();
        globalThis.fetch = async (url, options) => {
            assert.equal(url, "data/songs.json");
            assert.deepEqual(options, { cache: "no-cache" });
            return {
                ok: true,
                async text() {
                    return songsJson;
                }
            };
        };

        const loader = createDataLoader({
            data,
            ui,
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();

        assert.equal(songsJsonCache.peek(), songsJson);
        assert.equal(globalThis.localStorage.getItem("cachedCsv"), null);
        assert.equal(data.allSongsRaw.length, 1);
        assert.equal(data.allSongsRaw[0].songKey, "json-archive::1");
        assert.equal(calls.migrateLegacyBookmarkSongRefs, 1);
        assert.deepEqual(calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }]);
        assert.equal(ui.search.dataReady, true);
        assert.equal(ui.el.searchBox.disabled, false);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        restoreDom();
    }
});

test("data loader: cached json is shown immediately and refreshed in the background", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const cachedJson = createSongsJson("cached-archive::1", "sha256:cached");
        const freshJson = createSongsJson("fresh-archive::1", "sha256:fresh");
        const freshMetaJson = createSongsMetaJson("sha256:fresh");
        const songsJsonCache = createFakeSongsJsonCacheStore(cachedJson);
        let resolveFetch;
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            assert.deepEqual(options, { cache: "no-cache" });
            if (url === "data/songs-meta.json") {
                return {
                    ok: true,
                    async text() {
                        return freshMetaJson;
                    }
                };
            }
            assert.equal(url, "data/songs.json");
            return new Promise((resolve) => {
                resolveFetch = () => {
                    resolve({
                        ok: true,
                        async text() {
                            return freshJson;
                        }
                    });
                };
            });
        };
        const { data, ui, calls, callbacks } = createDataLoaderHarness();
        const loader = createDataLoader({
            data,
            ui,
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();
        await waitForAsyncWork();

        assert.equal(data.allSongsRaw[0].songKey, "cached-archive::1");
        assert.equal(ui.el.resultCount.innerText, "キャッシュを表示中");
        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.deepEqual(calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }]);

        resolveFetch();
        await waitForAsyncWork();
        await waitForAsyncWork();

        assert.equal(songsJsonCache.peek(), freshJson);
        assert.equal(data.allSongsRaw[0].songKey, "fresh-archive::1");
        assert.deepEqual(calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }, { immediate: true }]);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        restoreDom();
    }
});

test("data loader: cached json skips full refresh when meta hash matches", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const cachedJson = createSongsJson("cached-archive::1", "sha256:cached");
        const songsJsonCache = createFakeSongsJsonCacheStore(cachedJson);
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            assert.equal(url, "data/songs-meta.json");
            assert.deepEqual(options, { cache: "no-cache" });
            return {
                ok: true,
                async text() {
                    return createSongsMetaJson("sha256:cached");
                }
            };
        };
        const { data, ui, calls, callbacks } = createDataLoaderHarness();
        const loader = createDataLoader({
            data,
            ui,
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();
        await waitForAsyncWork();

        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), cachedJson);
        assert.equal(data.allSongsRaw[0].songKey, "cached-archive::1");
        assert.deepEqual(calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }]);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        restoreDom();
    }
});

test("data loader: legacy localStorage json is migrated into songs json cache", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const cachedJson = createSongsJson("legacy-archive::1", "sha256:legacy");
        const songsJsonCache = createFakeSongsJsonCacheStore();
        globalThis.localStorage.setItem("cachedSongsJson", cachedJson);
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            assert.equal(url, "data/songs-meta.json");
            assert.deepEqual(options, { cache: "no-cache" });
            return {
                ok: true,
                async text() {
                    return createSongsMetaJson("sha256:legacy");
                }
            };
        };
        const { data, ui, calls, callbacks } = createDataLoaderHarness();
        const loader = createDataLoader({
            data,
            ui,
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            legacySongsJsonCacheKey: "cachedSongsJson",
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();
        await waitForAsyncWork();

        assert.equal(songsJsonCache.peek(), cachedJson);
        assert.equal(globalThis.localStorage.getItem("cachedSongsJson"), null);
        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }]
        ]);
        assert.equal(data.allSongsRaw[0].songKey, "legacy-archive::1");
        assert.equal(ui.el.resultCount.innerText, "キャッシュを表示中");
        assert.deepEqual(calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }]);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        restoreDom();
    }
});

test("data loader: cached json falls back to full refresh when meta fetch fails", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    const previousConsoleWarn = console.warn;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const cachedJson = createSongsJson("cached-archive::1", "sha256:cached");
        const freshJson = createSongsJson("fresh-archive::1", "sha256:fresh");
        const songsJsonCache = createFakeSongsJsonCacheStore(cachedJson);
        const fetchUrls = [];
        const warnings = [];
        console.warn = (...args) => {
            warnings.push(args);
        };
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            assert.deepEqual(options, { cache: "no-cache" });
            if (url === "data/songs-meta.json") {
                return {
                    ok: false,
                    async text() {
                        throw new Error("should not read meta body");
                    }
                };
            }
            assert.equal(url, "data/songs.json");
            return {
                ok: true,
                async text() {
                    return freshJson;
                }
            };
        };
        const { data, ui, calls, callbacks } = createDataLoaderHarness();
        const loader = createDataLoader({
            data,
            ui,
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();
        await waitForAsyncWork();
        await waitForAsyncWork();

        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), freshJson);
        assert.equal(data.allSongsRaw[0].songKey, "fresh-archive::1");
        assert.deepEqual(calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }, { immediate: true }]);
        assert.equal(ui.search.dataReady, true);
        assert.match(String(warnings[0]?.[0]), /曲データJSONメタ情報の確認に失敗しました/);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        console.warn = previousConsoleWarn;
        restoreDom();
    }
});

test("data loader: json fetch failure falls back to csv fetch", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const csv = createValidCsv();
        const songsJsonCache = createFakeSongsJsonCacheStore();
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs.json") {
                return {
                    ok: false,
                    async text() {
                        throw new Error("should not read json body");
                    }
                };
            }
            assert.equal(url, "https://example.test/songs.csv");
            assert.deepEqual(options, { cache: "no-store" });
            return {
                ok: true,
                async text() {
                    return csv;
                }
            };
        };
        const { data, ui, calls, callbacks } = createDataLoaderHarness();
        const loader = createDataLoader({
            data,
            ui,
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();

        assert.deepEqual(fetchUrls, [
            ["data/songs.json", { cache: "no-cache" }],
            ["https://example.test/songs.csv", { cache: "no-store" }]
        ]);
        assert.equal(globalThis.localStorage.getItem("cachedCsv"), csv);
        assert.equal(data.allSongsRaw[0].songKey, "archive-1::1");
        assert.equal(ui.search.dataReady, true);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }]);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        restoreDom();
    }
});

test("data loader: failed fetch falls back to cached csv and skips reset when pending state exists", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const cachedCsv = createValidCsv();
        globalThis.localStorage.setItem("cachedCsv", cachedCsv);
        globalThis.fetch = async () => {
            throw new Error("network failed");
        };
        const { data, ui, calls, callbacks } = createDataLoaderHarness({
            pendingValues: { fromYear: "2026" }
        });
        const loader = createDataLoader({
            data,
            ui,
            publicCsvUrl: "https://example.test/songs.csv",
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();

        assert.equal(data.allSongsRaw.length, 1);
        assert.equal(ui.el.resultCount.innerText, "キャッシュを表示中");
        assert.equal(ui.search.dataReady, true);
        assert.equal(ui.el.searchBox.disabled, false);
        assert.deepEqual(calls.resetSearchConditionsArgs, []);
        assert.deepEqual(calls.scheduleSearchArgs, [{ immediate: true }]);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        restoreDom();
    }
});

test("data loader: failed fetch without cache shows error and leaves search disabled", async () => {
    const restoreDom = installFakeDom();
    const previousLocalStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.fetch = async () => ({
            ok: false,
            async text() {
                throw new Error("should not read body");
            }
        });
        const { data, ui, calls, callbacks } = createDataLoaderHarness();
        const loader = createDataLoader({
            data,
            ui,
            publicCsvUrl: "https://example.test/songs.csv",
            csvCacheKey: "cachedCsv",
            callbacks
        });

        await loader.loadInitialData();

        assert.equal(data.allSongsRaw.length, 0);
        assert.equal(ui.el.resultCount.innerText, "読込エラー");
        assert.equal(ui.search.dataReady, false);
        assert.equal(ui.el.searchBox.disabled, true);
        assert.deepEqual(calls.resetSearchConditionsArgs, []);
        assert.deepEqual(calls.scheduleSearchArgs, []);
    } finally {
        globalThis.localStorage = previousLocalStorage;
        globalThis.fetch = previousFetch;
        restoreDom();
    }
});
