import test from "node:test";
import assert from "node:assert/strict";
import { createDataLoader } from "../_build/app/ui/core/data.mjs";
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
        videoId: "abc123",
        songKey,
        bookmarkSongKey: `abc123::${songKey}`,
        legacySongKey: `${songKey}::https://www.youtube.com/watch?v=abc123&t=10s`,
        format: "配信",
        streamRole: "",
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
        applyDateInputRangeArgs: [],
        clampDateInputsToBoundsArgs: []
    };

    const callbacks = {
        applyDateInputRange(songs) {
            calls.applyDateInputRangeArgs.push(songs);
            return options.dateBounds ?? { minKey: 20260311, maxKey: 20260311 };
        },
        clampDateInputsToBounds(minKey, maxKey) {
            calls.clampDateInputsToBoundsArgs.push([minKey, maxKey]);
        }
    };

    return { data, ui, calls, callbacks };
}

/**
 * dataSource から返すスナップショットを指定して data loader を作る。
 * @param {{ initialSnapshot?: object | null }} options
 * @param {*} harness
 * @returns {*}
 */
function createLoaderWithDataSource(options, harness) {
    return createDataLoader({
        data: harness.data,
        ui: harness.ui,
        dataSource: {
            async loadInitialSnapshot() {
                return options.initialSnapshot ?? null;
            }
        },
        callbacks: harness.callbacks
    });
}

test("data loader: loaded songs enable search and report that initial conditions need reset", async () => {
    const restoreDom = installFakeDom();
    try {
        const song = createSong("archive-1::1");
        const harness = createDataLoaderHarness();
        const loader = createLoaderWithDataSource({
            initialSnapshot: { songs: [song], source: "network" }
        }, harness);

        const result = await loader.loadInitialData();

        assert.equal(harness.data.allSongsRaw.length, 1);
        assert.equal(harness.data.allSongsRaw[0], song);
        assert.equal(harness.calls.applyDateInputRangeArgs.length, 1);
        assert.equal(harness.calls.applyDateInputRangeArgs[0], harness.data.allSongsRaw);
        assert.deepEqual(harness.calls.clampDateInputsToBoundsArgs, [[20260311, 20260311]]);
        assert.deepEqual(result, { loaded: true, shouldResetConditions: true });
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
            initialSnapshot: {
                songs: [createSong("cached-archive::1")],
                source: "cache"
            }
        }, harness);

        const result = await loader.loadInitialData();

        assert.equal(harness.data.allSongsRaw.length, 1);
        assert.equal(harness.ui.el.resultCount.innerText, "キャッシュを表示中");
        assert.equal(harness.ui.search.dataReady, true);
        assert.equal(harness.ui.el.searchBox.disabled, false);
        assert.deepEqual(result, { loaded: true, shouldResetConditions: false });
    } finally {
        restoreDom();
    }
});

test("data loader: search stays disabled until the initial public snapshot is ready", async () => {
    const restoreDom = installFakeDom();
    try {
        const harness = createDataLoaderHarness();
        let resolveSnapshot;
        let loadCount = 0;
        const loader = createDataLoader({
            data: harness.data,
            ui: harness.ui,
            callbacks: harness.callbacks,
            dataSource: {
                loadInitialSnapshot() {
                    loadCount += 1;
                    return new Promise((resolve) => { resolveSnapshot = resolve; });
                }
            }
        });
        const loading = loader.loadInitialData();
        assert.equal(harness.ui.el.searchBox.disabled, true);
        assert.equal(harness.ui.el.resultCount.innerText, "データを読み込み中...");
        assert.deepEqual(harness.data.allSongsRaw, []);
        const song = createSong("public-archive::1");
        resolveSnapshot({ songs: [song], source: "network" });
        await loading;
        assert.deepEqual(harness.data.allSongsRaw, [song]);
        assert.equal(harness.ui.el.searchBox.disabled, false);
        assert.equal(loadCount, 1);
    } finally {
        restoreDom();
    }
});

test("data loader: failed load shows error and leaves search disabled", async () => {
    const restoreDom = installFakeDom();
    try {
        const harness = createDataLoaderHarness();
        const loader = createLoaderWithDataSource({ initialSnapshot: null }, harness);

        const result = await loader.loadInitialData();

        assert.equal(harness.data.allSongsRaw.length, 0);
        assert.equal(harness.ui.el.resultCount.innerText, "読込エラー");
        assert.equal(harness.ui.search.dataReady, false);
        assert.equal(harness.ui.el.searchBox.disabled, true);
        assert.deepEqual(result, { loaded: false });
    } finally {
        restoreDom();
    }
});
