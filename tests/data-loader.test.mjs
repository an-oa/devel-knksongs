import test from "node:test";
import assert from "node:assert/strict";
import { createDataLoader } from "../app/ui/core/data.mjs";
import { installFakeDom } from "./test-helpers.mjs";

/**
 * data loader テスト用の曲データを返す。
 * @param {string} songKey
 * @returns {*}
 */
function createSong(songKey) {
    const archiveId = songKey.split("::")[0] || "json-archive";
    return {
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
    };
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

/**
 * dataSource から渡す結果を指定して data loader を作る。
 * @param {{ onLoad: Function }} options
 * @param {*} harness
 * @returns {*}
 */
function createLoaderWithDataSource(options, harness) {
    return createDataLoader({
        data: harness.data,
        ui: harness.ui,
        dataSource: {
            async loadInitialSongs(callbacks) {
                return options.onLoad(callbacks);
            }
        },
        callbacks: harness.callbacks
    });
}

test("data loader: loaded songs enable search, reset initial conditions, and schedule search", async () => {
    const restoreDom = installFakeDom();
    try {
        const song = createSong("archive-1::1");
        const harness = createDataLoaderHarness();
        const loader = createLoaderWithDataSource({
            onLoad({ onSongsLoaded }) {
                onSongsLoaded({ songs: [song], source: "network" });
                return true;
            }
        }, harness);

        await loader.loadInitialData();

        assert.equal(harness.data.allSongsRaw.length, 1);
        assert.equal(harness.data.allSongsRaw[0], song);
        assert.equal(harness.calls.migrateLegacyBookmarkSongRefs, 1);
        assert.equal(harness.calls.applyDateInputRangeArgs.length, 1);
        assert.equal(harness.calls.applyDateInputRangeArgs[0], harness.data.allSongsRaw);
        assert.deepEqual(harness.calls.clampDateInputsToBoundsArgs, [[20260311, 20260311]]);
        assert.deepEqual(harness.calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(harness.calls.scheduleSearchArgs, [{ immediate: true }]);
        assert.equal(harness.ui.search.recommendedCache, null);
        assert.equal(harness.ui.search.dataReady, true);
        assert.equal(harness.ui.el.searchBox.disabled, false);
    } finally {
        restoreDom();
    }
});

test("data loader: cache source shows cache status and skips reset when pending state exists", async () => {
    const restoreDom = installFakeDom();
    try {
        const harness = createDataLoaderHarness({
            pendingValues: { fromYear: "2026" }
        });
        const loader = createLoaderWithDataSource({
            onLoad({ onSongsLoaded }) {
                onSongsLoaded({ songs: [createSong("cached-archive::1")], source: "cache" });
                return true;
            }
        }, harness);

        await loader.loadInitialData();

        assert.equal(harness.data.allSongsRaw.length, 1);
        assert.equal(harness.ui.el.resultCount.innerText, "キャッシュを表示中");
        assert.equal(harness.ui.search.dataReady, true);
        assert.equal(harness.ui.el.searchBox.disabled, false);
        assert.deepEqual(harness.calls.resetSearchConditionsArgs, []);
        assert.deepEqual(harness.calls.scheduleSearchArgs, [{ immediate: true }]);
    } finally {
        restoreDom();
    }
});

test("data loader: background refresh applies new songs without resetting conditions again", async () => {
    const restoreDom = installFakeDom();
    try {
        const harness = createDataLoaderHarness();
        const loader = createLoaderWithDataSource({
            onLoad({ onSongsLoaded }) {
                onSongsLoaded({ songs: [createSong("cached-archive::1")], source: "cache" });
                onSongsLoaded({
                    songs: [createSong("fresh-archive::1")],
                    source: "network",
                    resetConditions: false
                });
                return true;
            }
        }, harness);

        await loader.loadInitialData();

        assert.equal(harness.data.allSongsRaw[0].songKey, "fresh-archive::1");
        assert.deepEqual(harness.calls.resetSearchConditionsArgs, [false]);
        assert.deepEqual(harness.calls.scheduleSearchArgs, [{ immediate: true }, { immediate: true }]);
        assert.equal(harness.calls.migrateLegacyBookmarkSongRefs, 2);
    } finally {
        restoreDom();
    }
});

test("data loader: failed load shows error and leaves search disabled", async () => {
    const restoreDom = installFakeDom();
    try {
        const harness = createDataLoaderHarness();
        const loader = createLoaderWithDataSource({
            onLoad() {
                return false;
            }
        }, harness);

        await loader.loadInitialData();

        assert.equal(harness.data.allSongsRaw.length, 0);
        assert.equal(harness.ui.el.resultCount.innerText, "読込エラー");
        assert.equal(harness.ui.search.dataReady, false);
        assert.equal(harness.ui.el.searchBox.disabled, true);
        assert.deepEqual(harness.calls.resetSearchConditionsArgs, []);
        assert.deepEqual(harness.calls.scheduleSearchArgs, []);
    } finally {
        restoreDom();
    }
});
