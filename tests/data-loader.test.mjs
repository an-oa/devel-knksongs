import test from "node:test";
import assert from "node:assert/strict";
import { createDataLoader } from "../app/ui/core/data.mjs";
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
