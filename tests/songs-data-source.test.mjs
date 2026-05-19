import test from "node:test";
import assert from "node:assert/strict";
import { createSongsDataSource } from "../app/lib/songs-data-source.mjs";
import { createLegacyLocalStorageSongsJsonCacheAdapter } from "../app/lib/storage/songs-json-cache.mjs";
import { buildSongsJsonMetaPayload, buildSongsJsonPayload } from "../app/lib/songs-json.mjs";

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
 * data source テスト用の最小 CSV を返す。
 * @returns {string}
 */
function createValidCsv() {
    return [
        "#,配信日,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        "archive-1,2026/03/11,縦,全体,配信,,,1,KING,Kanaria feat. GUMI,キング,カナリアフィーチャリンググミ,https://www.youtube.com/watch?v=abc123&t=10s,0:09:41,"
    ].join("\n");
}

/**
 * data source テスト用のJSON文字列を返す。
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
 * data source テスト用のJSONメタ情報を返す。
 * @param {string} contentHash
 * @returns {string}
 */
function createSongsMetaJson(contentHash) {
    return JSON.stringify(buildSongsJsonMetaPayload(contentHash));
}

test("songs data source: csv fetch success stores csv and emits network songs", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
        const csv = createValidCsv();
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
        const results = [];
        const dataSource = createSongsDataSource({
            publicCsvUrl: "https://example.test/songs.csv",
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.equal(storage.getItem("cachedCsv"), csv);
        assert.equal(results.length, 1);
        assert.equal(results[0].source, "network");
        assert.equal(results[0].songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: json fetch success stores songs json and skips csv fetch", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
        const songsJson = createSongsJson("json-archive::1");
        const songsJsonCache = createFakeSongsJsonCacheStore();
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
        const results = [];
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.equal(songsJsonCache.peek(), songsJson);
        assert.equal(storage.getItem("cachedCsv"), null);
        assert.equal(results.length, 1);
        assert.equal(results[0].source, "network");
        assert.equal(results[0].songs[0].songKey, "json-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: cached json fetches fresh json without emitting stale cache when meta differs", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
        const cachedJson = createSongsJson("cached-archive::1", "sha256:cached");
        const freshJson = createSongsJson("fresh-archive::1", "sha256:fresh");
        const freshMetaJson = createSongsMetaJson("sha256:fresh");
        const songsJsonCache = createFakeSongsJsonCacheStore(cachedJson);
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
            return {
                ok: true,
                async text() {
                    return freshJson;
                }
            };
        };
        const results = [];
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), freshJson);
        assert.equal(results.length, 1);
        assert.equal(results[0].source, "network");
        assert.equal(results[0].songs[0].songKey, "fresh-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: cached json falls back to cache when fresh json and csv fail after meta differs", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
        const cachedJson = createSongsJson("cached-archive::1", "sha256:cached");
        const freshMetaJson = createSongsMetaJson("sha256:fresh");
        const songsJsonCache = createFakeSongsJsonCacheStore(cachedJson);
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs-meta.json") {
                assert.deepEqual(options, { cache: "no-cache" });
                return {
                    ok: true,
                    async text() {
                        return freshMetaJson;
                    }
                };
            }
            if (url === "data/songs.json") {
                assert.deepEqual(options, { cache: "no-cache" });
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
                ok: false,
                async text() {
                    throw new Error("should not read csv body");
                }
            };
        };
        const results = [];
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }],
            ["https://example.test/songs.csv", { cache: "no-store" }]
        ]);
        assert.equal(songsJsonCache.peek(), cachedJson);
        assert.equal(results.length, 1);
        assert.equal(results[0].source, "cache");
        assert.equal(results[0].songs[0].songKey, "cached-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: cached json skips full refresh when meta hash matches", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
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
        const results = [];
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), cachedJson);
        assert.equal(results.length, 1);
        assert.equal(results[0].songs[0].songKey, "cached-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: legacy localStorage json is migrated into songs json cache", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
        const cachedJson = createSongsJson("legacy-archive::1", "sha256:legacy");
        const primarySongsJsonCache = createFakeSongsJsonCacheStore();
        const songsJsonCache = createLegacyLocalStorageSongsJsonCacheAdapter({
            cache: primarySongsJsonCache,
            legacyKey: "cachedSongsJson",
            storage
        });
        storage.setItem("cachedSongsJson", cachedJson);
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
        const results = [];
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.equal(primarySongsJsonCache.peek(), cachedJson);
        assert.equal(storage.getItem("cachedSongsJson"), null);
        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }]
        ]);
        assert.equal(results.length, 1);
        assert.equal(results[0].source, "cache");
        assert.equal(results[0].songs[0].songKey, "legacy-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: cached json falls back to cache when meta fetch fails", async () => {
    const previousFetch = globalThis.fetch;
    const previousConsoleWarn = console.warn;
    try {
        const storage = createFakeLocalStorage();
        const cachedJson = createSongsJson("cached-archive::1", "sha256:cached");
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
            throw new Error(`unexpected fetch: ${url}`);
        };
        const results = [];
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.deepEqual(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), cachedJson);
        assert.equal(results.length, 1);
        assert.equal(results[0].source, "cache");
        assert.equal(results[0].songs[0].songKey, "cached-archive::1");
        assert.match(String(warnings[0]?.[0]), /曲データJSONメタ情報の確認に失敗しました/);
    } finally {
        globalThis.fetch = previousFetch;
        console.warn = previousConsoleWarn;
    }
});

test("songs data source: json fetch failure falls back to csv fetch", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
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
        const results = [];
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.deepEqual(fetchUrls, [
            ["data/songs.json", { cache: "no-cache" }],
            ["https://example.test/songs.csv", { cache: "no-store" }]
        ]);
        assert.equal(storage.getItem("cachedCsv"), csv);
        assert.equal(results.length, 1);
        assert.equal(results[0].source, "network");
        assert.equal(results[0].songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: failed csv fetch falls back to cached csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
        const cachedCsv = createValidCsv();
        storage.setItem("cachedCsv", cachedCsv);
        globalThis.fetch = async () => {
            throw new Error("network failed");
        };
        const results = [];
        const dataSource = createSongsDataSource({
            publicCsvUrl: "https://example.test/songs.csv",
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), true);

        assert.equal(results.length, 1);
        assert.equal(results[0].source, "cache");
        assert.equal(results[0].songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: failed fetch without cache returns false", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
        globalThis.fetch = async () => ({
            ok: false,
            async text() {
                throw new Error("should not read body");
            }
        });
        const results = [];
        const dataSource = createSongsDataSource({
            publicCsvUrl: "https://example.test/songs.csv",
            storage,
            csvCacheKey: "cachedCsv"
        });

        assert.equal(await dataSource.loadInitialSongs({ onSongsLoaded: (result) => results.push(result) }), false);
        assert.deepEqual(results, []);
    } finally {
        globalThis.fetch = previousFetch;
    }
});
