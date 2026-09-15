import test from "node:test";
import assert from "node:assert/strict";
import { createSongsDataSource } from "../_build/app/lib/songs-data-source.mjs";
import { createLegacyLocalStorageSongsJsonCacheAdapter } from "../_build/app/lib/storage/songs-json-cache.mjs";
import { buildSongsJsonMetaPayload, buildSongsJsonPayload } from "../_build/app/lib/songs-json.mjs";

const GENERATED_AT = "2026-08-14T00:00:00.000Z";

/**
 * data sourceテスト用のlocalStorageを作る。
 * @returns {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void }}
 */
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
        }
    };
}

/**
 * data sourceテスト用のテキストキャッシュを作る。
 * @param {string | null} initialValue 初期値
 */
function createFakeTextCacheStore(initialValue = null) {
    let value = initialValue;
    let removeCount = 0;
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
            removeCount += 1;
        },
        peek() {
            return value;
        },
        getRemoveCount() {
            return removeCount;
        }
    };
}

/**
 * data sourceテスト用の最小CSVを返す。
 * @returns {string}
 */
function createValidCsv() {
    return [
        "#,配信日,配信上の立場,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        "archive-1,2026/03/11,,縦,全体,配信,,,1,KING,Kanaria feat. GUMI,キング,カナリアフィーチャリンググミ,https://www.youtube.com/watch?v=abc123def45&t=10s,0:09:41,"
    ].join("\n");
}

/**
 * data sourceテスト用のJSON文字列を返す。
 * @param {string} songKey 曲識別子
 * @param {string} contentHash 内容hash
 * @param {string} generatedAt 生成日時
 * @returns {string}
 */
function createSongsJson(
    songKey,
    contentHash = `sha256:${songKey}`,
    generatedAt = GENERATED_AT
) {
    const archiveId = songKey.split("::")[0] || "json-archive";
    return JSON.stringify(buildSongsJsonPayload([
        {
            date: "2026/03/11",
            dateKey: 20260311,
            archiveId,
            archiveOrder: 1,
            videoId: "abc123def45",
            songKey,
            bookmarkSongKey: "abc123def45::1",
            legacySongKey: `${songKey}::https://www.youtube.com/watch?v=abc123def45&t=10s`,
            format: "配信",
            streamRole: "",
            videoOrientation: "vertical",
            isRelay: false,
            isHarmony: false,
            title: "KING",
            artist: "Kanaria feat. GUMI",
            titleYomi: "キング",
            artistYomi: "カナリアフィーチャリンググミ",
            url: "https://www.youtube.com/watch?v=abc123def45&t=10s",
            endSeconds: 581,
            titleNorm: "king",
            artistNorm: "kanaria feat. gumi",
            titleYomiNorm: "キング",
            artistYomiNorm: "カナリアフィーチャリンググミ"
        }
    ], contentHash, generatedAt));
}

/**
 * 直前schemaのキャッシュ確認用JSON文字列を返す。
 * @param {string} songKey 曲識別子
 * @param {string} contentHash 内容hash
 * @returns {string}
 */
function createPreviousSchemaSongsJson(songKey, contentHash) {
    const payload = JSON.parse(createSongsJson(songKey, contentHash));
    payload.schemaVersion -= 1;
    payload.songs.forEach((song, index) => {
        song.sourceIndex = index;
    });
    return JSON.stringify(payload);
}

/**
 * data sourceテスト用のJSONメタ情報を返す。
 * @param {string} contentHash 内容hash
 * @param {string} generatedAt 生成日時
 * @returns {string}
 */
function createSongsMetaJson(contentHash, generatedAt = GENERATED_AT) {
    return JSON.stringify(buildSongsJsonMetaPayload(contentHash, generatedAt));
}

/**
 * fetchテスト用の成功responseを返す。
 * @param {string} body response本文
 */
function createResponse(body) {
    return {
        ok: true,
        async text() {
            return body;
        }
    };
}

/**
 * fetchテスト用の失敗responseを返す。
 */
function createFailedResponse() {
    return {
        ok: false,
        async text() {
            throw new Error("should not read failed response body");
        }
    };
}

/**
 * fetch呼び出しを、タイムアウトsignalを含む公開上の取得条件として比較する。
 * @param {Array<[string, RequestInit & { priority?: string }]>} actual 実際のfetch呼び出し
 * @param {Array<[string, { cache: RequestCache, priority?: string }]>} expected 期待するfetch呼び出し
 */
function assertFetchCalls(actual, expected) {
    assert.deepEqual(
        actual.map(([url, options]) => [url, {
            cache: options.cache,
            priority: options.priority,
            hasAbortSignal: options.signal instanceof AbortSignal
        }]),
        expected.map(([url, options]) => [url, {
            cache: options.cache,
            priority: options.priority,
            hasAbortSignal: true
        }])
    );
}

/**
 * abortされるまで応答しないfetchを返す。
 * @returns {(url: string, options: RequestInit) => Promise<never>}
 */
function createPendingFetch() {
    return (_url, options) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
            reject(options.signal.reason);
        }, { once: true });
    });
}

test("songs data source: network csv is used without creating a runtime csv cache", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const csv = createValidCsv();
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            return createResponse(csv);
        };
        const dataSource = createSongsDataSource({
            publicCsvUrl: "https://example.test/songs.csv"
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["https://example.test/songs.csv", { cache: "no-store" }]
        ]);
        assert.equal(snapshot.source, "network");
        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: network json success stores json and skips csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const songsJson = createSongsJson("json-archive::1");
        const songsJsonCache = createFakeTextCacheStore();
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            return createResponse(songsJson);
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [["data/songs.json", { cache: "no-cache" }]]);
        assert.equal(songsJsonCache.peek(), songsJson);
        assert.equal(snapshot.source, "network");
        assert.equal(snapshot.songs[0].songKey, "json-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

for (const saveResult of ["success", "false", "reject"]) {
    test(`songs data source: initial snapshot does not wait for cache save (${saveResult})`, async (t) => {
        const jsonText = createSongsJson("public::1", "sha256:public");
        const cache = createFakeTextCacheStore();
        let finishSave;
        let savedText;
        const save = new Promise((resolve, reject) => {
            finishSave = () => saveResult === "reject"
                ? reject(new Error("storage failed")) : resolve(saveResult === "success");
        });
        t.mock.method(cache, "setText", (text) => {
            savedText = text;
            return save;
        });
        const warnings = t.mock.method(console, "warn", () => {});
        const fetchMock = t.mock.method(globalThis, "fetch", async () => createResponse(jsonText));
        let snapshot;
        const loading = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache: cache
        }).loadInitialSnapshot().then((value) => { snapshot = value; });
        try {
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(savedText, jsonText, "saves the received text without serializing songs again");
            assert.equal(snapshot?.source, "network", "storage may still be pending when data is ready");
            assert.equal(snapshot.songs[0].songKey, "public::1");
        } finally {
            finishSave();
            await loading;
            await new Promise((resolve) => setImmediate(resolve));
        }
        assert.equal(fetchMock.mock.callCount(), 1, "a failed save does not trigger CSV fallback");
        assert.equal(warnings.mock.callCount(), saveResult === "reject" ? 1 : 0);
    });
}

test("songs data source: structurally invalid network json is not cached and falls back to csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const invalidPayload = JSON.parse(createSongsJson("invalid-archive::1"));
        delete invalidPayload.songs[0].title;
        const songsJsonCache = createFakeTextCacheStore();
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs.json") return createResponse(JSON.stringify(invalidPayload));
            return createResponse(createValidCsv());
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs.json", { cache: "no-cache" }],
            ["https://example.test/songs.csv", { cache: "no-store" }]
        ]);
        assert.equal(songsJsonCache.peek(), null);
        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: matching meta hash uses cached json without fetching the body", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const cachedJson = createSongsJson("cached-archive::1", "sha256:cached");
        const songsJsonCache = createFakeTextCacheStore(cachedJson);
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            return createResponse(createSongsMetaJson("sha256:cached", "2026-08-15T00:00:00.000Z"));
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [[
            "data/songs-meta.json",
            { cache: "no-cache" }
        ]]);
        assert.equal(snapshot.source, "cache");
        assert.equal(snapshot.songs[0].songKey, "cached-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: newer public json is used for the initial snapshot", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const cachedJson = createSongsJson(
            "cached-archive::1",
            "sha256:cached",
            "2026-08-13T00:00:00.000Z"
        );
        const freshJson = createSongsJson(
            "fresh-archive::1",
            "sha256:fresh",
            "2026-08-14T00:00:00.000Z"
        );
        const songsJsonCache = createFakeTextCacheStore(cachedJson);
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs-meta.json") {
                return createResponse(createSongsMetaJson("sha256:fresh"));
            }
            return createResponse(freshJson);
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), freshJson);
        assert.equal(snapshot.source, "network");
        assert.equal(snapshot.songs[0].songKey, "fresh-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: older public json replaces a newer cache when hashes differ", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const cachedJson = createSongsJson("cached-archive::1", "sha256:newer-cache", "2026-08-15T00:00:00.000Z");
        const publicJson = createSongsJson("public-archive::1", "sha256:public");
        const songsJsonCache = createFakeTextCacheStore(cachedJson);
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            return createResponse(url === "data/songs-meta.json"
                ? createSongsMetaJson("sha256:public")
                : publicJson);
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();

        assertFetchCalls(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(snapshot.source, "network");
        assert.equal(snapshot.songs[0].songKey, "public-archive::1");
        assert.equal(songsJsonCache.peek(), publicJson);
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: meta fetch failure still tries network json", async () => {
    const previousFetch = globalThis.fetch;
    const previousConsoleWarn = console.warn;
    try {
        const cachedJson = createSongsJson(
            "cached-archive::1",
            "sha256:cached",
            "2026-08-13T00:00:00.000Z"
        );
        const freshJson = createSongsJson(
            "fresh-archive::1",
            "sha256:fresh",
            "2026-08-14T00:00:00.000Z"
        );
        const songsJsonCache = createFakeTextCacheStore(cachedJson);
        const fetchUrls = [];
        const warnings = [];
        console.warn = (...args) => warnings.push(args);
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs-meta.json") return createFailedResponse();
            return createResponse(freshJson);
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), freshJson);
        assert.equal(snapshot.source, "network");
        assert.equal(snapshot.songs[0].songKey, "fresh-archive::1");
        assert.match(String(warnings[0]?.[0]), /曲データJSONメタ情報の確認に失敗しました/);
    } finally {
        globalThis.fetch = previousFetch;
        console.warn = previousConsoleWarn;
    }
});

test("songs data source: meta fetch failure still allows older public json to replace a newer cache", async () => {
    const previousFetch = globalThis.fetch;
    const previousConsoleWarn = console.warn;
    try {
        const cachedJson = createSongsJson(
            "cached-archive::1",
            "sha256:newer-cache",
            "2026-08-15T00:00:00.000Z"
        );
        const olderJson = createSongsJson(
            "older-network::1",
            "sha256:older-network",
            "2026-08-14T00:00:00.000Z"
        );
        const songsJsonCache = createFakeTextCacheStore(cachedJson);
        const fetchUrls = [];
        console.warn = () => {};
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs-meta.json") return createFailedResponse();
            return createResponse(olderJson);
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), olderJson);
        assert.equal(snapshot.source, "network");
        assert.equal(snapshot.songs[0].songKey, "older-network::1");
    } finally {
        globalThis.fetch = previousFetch;
        console.warn = previousConsoleWarn;
    }
});

test("songs data source: json failure uses valid json cache before network csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const cachedJson = createSongsJson(
            "cached-archive::1",
            "sha256:cached",
            "2026-08-13T00:00:00.000Z"
        );
        const songsJsonCache = createFakeTextCacheStore(cachedJson);
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs-meta.json") {
                return createResponse(createSongsMetaJson("sha256:fresh"));
            }
            return createFailedResponse();
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), cachedJson);
        assert.equal(snapshot.source, "cache");
        assert.equal(snapshot.songs[0].songKey, "cached-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: json newer than stale meta is accepted and cached", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const newerJson = createSongsJson(
            "newer-archive::1",
            "sha256:newer",
            "2026-08-15T00:00:00.000Z"
        );
        const songsJsonCache = createFakeTextCacheStore();
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs-meta.json") {
                return createResponse(createSongsMetaJson(
                    "sha256:older",
                    "2026-08-14T00:00:00.000Z"
                ));
            }
            return createResponse(newerJson);
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), newerJson);
        assert.equal(snapshot.songs[0].songKey, "newer-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: json older than meta is not cached and falls back to csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const olderJson = createSongsJson(
            "older-archive::1",
            "sha256:older",
            "2026-08-13T00:00:00.000Z"
        );
        const songsJsonCache = createFakeTextCacheStore();
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs-meta.json") {
                return createResponse(createSongsMetaJson(
                    "sha256:newer",
                    "2026-08-14T00:00:00.000Z"
                ));
            }
            if (url === "data/songs.json") return createResponse(olderJson);
            return createResponse(createValidCsv());
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }],
            ["https://example.test/songs.csv", { cache: "no-store" }]
        ]);
        assert.equal(songsJsonCache.peek(), null);
        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: equal timestamps with mismatched hashes are rejected", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const inconsistentJson = createSongsJson("inconsistent::1", "sha256:json");
        const songsJsonCache = createFakeTextCacheStore();
        globalThis.fetch = async (url) => {
            if (url === "data/songs-meta.json") {
                return createResponse(createSongsMetaJson("sha256:meta"));
            }
            if (url === "data/songs.json") return createResponse(inconsistentJson);
            return createResponse(createValidCsv());
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assert.equal(songsJsonCache.peek(), null);
        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: older schema cache is removed and handled as a cache miss", async () => {
    const previousFetch = globalThis.fetch;
    const previousConsoleWarn = console.warn;
    try {
        const legacyJson = createPreviousSchemaSongsJson("legacy-archive::1", "sha256:legacy");
        const freshJson = createSongsJson("fresh-archive::1", "sha256:fresh");
        const songsJsonCache = createFakeTextCacheStore(legacyJson);
        const fetchUrls = [];
        console.warn = () => {};
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs-meta.json") {
                return createResponse(createSongsMetaJson("sha256:fresh"));
            }
            return createResponse(freshJson);
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs-meta.json", { cache: "no-cache" }],
            ["data/songs.json", { cache: "no-cache" }]
        ]);
        assert.equal(songsJsonCache.peek(), freshJson);
        assert.equal(songsJsonCache.getRemoveCount(), 1);
        assert.equal(snapshot.source, "network");
        assert.equal(snapshot.songs[0].songKey, "fresh-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
        console.warn = previousConsoleWarn;
    }
});

test("songs data source: older schema network json is not cached and falls back to csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const legacyJson = createPreviousSchemaSongsJson("legacy-network::1", "sha256:legacy");
        const songsJsonCache = createFakeTextCacheStore();
        globalThis.fetch = async (url) => {
            if (url === "data/songs.json") return createResponse(legacyJson);
            return createResponse(createValidCsv());
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assert.equal(songsJsonCache.peek(), null);
        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: invalid cached json is removed before network fallback", async () => {
    const previousFetch = globalThis.fetch;
    const previousConsoleWarn = console.warn;
    try {
        const songsJsonCache = createFakeTextCacheStore("not json");
        console.warn = () => {};
        globalThis.fetch = async (url) => {
            if (url === "data/songs.json") return createFailedResponse();
            return createResponse(createValidCsv());
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assert.equal(songsJsonCache.getRemoveCount(), 1);
        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
        console.warn = previousConsoleWarn;
    }
});

test("songs data source: legacy localStorage json is migrated into the json cache", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const storage = createFakeLocalStorage();
        const cachedJson = createSongsJson("legacy-archive::1", "sha256:legacy");
        const primarySongsJsonCache = createFakeTextCacheStore();
        const songsJsonCache = createLegacyLocalStorageSongsJsonCacheAdapter({
            cache: primarySongsJsonCache,
            legacyKey: "cachedSongsJson",
            storage
        });
        storage.setItem("cachedSongsJson", cachedJson);
        globalThis.fetch = async (url) => {
            assert.equal(url, "data/songs-meta.json");
            return createResponse(createSongsMetaJson("sha256:legacy"));
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assert.equal(primarySongsJsonCache.peek(), cachedJson);
        assert.equal(storage.getItem("cachedSongsJson"), null);
        assert.equal(snapshot.source, "cache");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: failed json without cache falls back to network csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const fetchUrls = [];
        globalThis.fetch = async (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs.json") return createFailedResponse();
            return createResponse(createValidCsv());
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache: createFakeTextCacheStore()
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs.json", { cache: "no-cache" }],
            ["https://example.test/songs.csv", { cache: "no-store" }]
        ]);
        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: all network failures without json cache return null", async () => {
    const previousFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => createFailedResponse();
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache: createFakeTextCacheStore()
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.equal(snapshot, null);
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: initial cache display waits for public meta confirmation", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const cachedJson = createSongsJson("cached-archive::1", "sha256:cached");
        let resolveMeta;
        globalThis.fetch = () => new Promise((resolve) => {
            resolveMeta = () => resolve(createResponse(createSongsMetaJson("sha256:cached")));
        });
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache: createFakeTextCacheStore(cachedJson)
        });
        let settled = false;
        const initialPromise = dataSource.loadInitialSnapshot().then((snapshot) => {
            settled = true;
            return snapshot;
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(settled, false);
        resolveMeta();
        const snapshot = await initialPromise;
        assert.equal(snapshot.source, "cache");
        assert.equal(snapshot.songs[0].songKey, "cached-archive::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: stalled json request times out before falling back to network csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const fetchUrls = [];
        const pendingFetch = createPendingFetch();
        globalThis.fetch = (url, options) => {
            fetchUrls.push([url, options]);
            if (url === "data/songs.json") return pendingFetch(url, options);
            return Promise.resolve(createResponse(createValidCsv()));
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache: createFakeTextCacheStore(),
            songsJsonResponseTimeoutMs: 10,
            csvResponseTimeoutMs: 50
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assertFetchCalls(fetchUrls, [
            ["data/songs.json", { cache: "no-cache" }],
            ["https://example.test/songs.csv", { cache: "no-store" }]
        ]);
        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: slow json body may finish after the response timeout", async () => {
    const previousFetch = globalThis.fetch;
    try {
        const songsJson = createSongsJson("slow-json::1");
        const songsJsonCache = createFakeTextCacheStore();
        globalThis.fetch = (_url, options) => Promise.resolve({
            ok: true,
            text() {
                return new Promise((resolve, reject) => {
                    const timerId = setTimeout(() => resolve(songsJson), 20);
                    options.signal.addEventListener("abort", () => {
                        clearTimeout(timerId);
                        reject(options.signal.reason);
                    }, { once: true });
                });
            }
        });
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache,
            songsJsonResponseTimeoutMs: 10,
            songsJsonBodyTimeoutMs: 50,
            csvResponseTimeoutMs: 10,
            csvBodyTimeoutMs: 50
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assert.equal(snapshot.songs[0].songKey, "slow-json::1");
        assert.equal(songsJsonCache.peek(), songsJson);
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test("songs data source: stalled json body times out before falling back to network csv", async () => {
    const previousFetch = globalThis.fetch;
    try {
        globalThis.fetch = (url, options) => {
            if (url !== "data/songs.json") {
                return Promise.resolve(createResponse(createValidCsv()));
            }
            return Promise.resolve({
                ok: true,
                text() {
                    return new Promise((_resolve, reject) => {
                        options.signal.addEventListener("abort", () => {
                            reject(options.signal.reason);
                        }, { once: true });
                    });
                }
            });
        };
        const dataSource = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache: createFakeTextCacheStore(),
            songsJsonResponseTimeoutMs: 50,
            songsJsonBodyTimeoutMs: 10,
            csvResponseTimeoutMs: 50,
            csvBodyTimeoutMs: 50
        });

        const snapshot = await dataSource.loadInitialSnapshot();
        assert.ok(snapshot);

        assert.equal(snapshot.songs[0].songKey, "archive-1::1");
    } finally {
        globalThis.fetch = previousFetch;
    }
});

for (const invalidKind of ["malformed", "older-than-meta", "same-time-different-hash"]) {
    test(`songs data source: ${invalidKind} public json preserves valid cache`, async (t) => {
        const cachedJson = createSongsJson("cached::1", "sha256:cached");
        const songsJsonCache = createFakeTextCacheStore(cachedJson);
        const publicJson = invalidKind === "malformed" ? "not json" : createSongsJson(
            "public::1", "sha256:public",
            invalidKind === "older-than-meta" ? "2026-08-13T00:00:00.000Z" : GENERATED_AT
        );
        const urls = [];
        t.mock.method(globalThis, "fetch", async (url) => {
            urls.push(url);
            return createResponse(url === "data/songs-meta.json"
                ? createSongsMetaJson("sha256:meta") : publicJson);
        });
        const snapshot = await createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache
        }).loadInitialSnapshot();
        assert.equal(snapshot.source, "cache");
        assert.equal(snapshot.songs[0].songKey, "cached::1");
        assert.equal(songsJsonCache.peek(), cachedJson);
        assert.deepEqual(urls, ["data/songs-meta.json", "data/songs.json"]);
    });
}

/** 仮想時計とPromiseの継続を進め、段階をまたぐ通信期限を検証する。 */
function createNetworkClock(t) {
    let now = 0;
    t.mock.timers.enable({ apis: ["setTimeout"] });
    t.mock.method(performance, "now", () => now);
    return async (milliseconds) => {
        now += milliseconds;
        t.mock.timers.tick(milliseconds);
        await new Promise((resolve) => setImmediate(resolve));
    };
}

test("songs data source: meta and json response/body share the default five second deadline", async (t) => {
    const tick = createNetworkClock(t);
    const cachedJson = createSongsJson("cached::1", "sha256:cached");
    const songsJsonCache = createFakeTextCacheStore(cachedJson);
    const urls = [];
    let jsonSignal;
    let releaseBody;
    t.mock.method(globalThis, "fetch", (url, options) => {
        urls.push(url);
        if (url === "data/songs-meta.json") {
            return new Promise((resolve) => setTimeout(() => resolve({
                ok: true,
                text: () => new Promise((resolveBody) => setTimeout(
                    () => resolveBody(createSongsMetaJson("sha256:public")), 1000
                ))
            }), 1000));
        }
        jsonSignal = options.signal;
        return new Promise((resolve) => setTimeout(() => resolve({
            ok: true,
            text: () => new Promise((resolveBody, reject) => {
                releaseBody = () => resolveBody(createSongsJson("public::1", "sha256:public"));
                options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
            })
        }), 1000));
    });
    let settled = false;
    const loading = createSongsDataSource({
        publicSongsJsonUrl: "data/songs.json",
        publicSongsMetaUrl: "data/songs-meta.json",
        publicCsvUrl: "https://example.test/songs.csv",
        songsJsonCache
    }).loadInitialSnapshot().then((snapshot) => {
        settled = true;
        return snapshot;
    });
    await tick(0);
    await tick(1000); // meta response
    await tick(1000); // meta body
    await tick(1000); // json response
    await tick(1999);
    assert.equal(settled, false);
    assert.equal(jsonSignal.aborted, false);
    await tick(1);
    const snapshot = await loading;
    assert.equal(jsonSignal.aborted, true);
    assert.equal(snapshot.source, "cache");
    assert.equal(snapshot.songs[0].songKey, "cached::1");
    releaseBody();
    await tick(30_000);
    assert.equal(songsJsonCache.peek(), cachedJson);
    assert.deepEqual(urls, ["data/songs-meta.json", "data/songs.json"]);
});

for (const phase of ["response", "body"]) {
    test(`songs data source: meta ${phase} exhausting the deadline prevents a json request`, async (t) => {
        const tick = createNetworkClock(t);
        t.mock.method(console, "warn", () => {});
        const cachedJson = createSongsJson("cached::1", "sha256:cached");
        const urls = [];
        let signal;
        t.mock.method(globalThis, "fetch", (url, options) => {
            urls.push(url);
            signal = options.signal;
            const pending = () => createPendingFetch()(url, options);
            return phase === "response" ? pending() : Promise.resolve({ ok: true, text: pending });
        });
        const loading = createSongsDataSource({
            publicSongsJsonUrl: "data/songs.json",
            publicSongsMetaUrl: "data/songs-meta.json",
            publicCsvUrl: "https://example.test/songs.csv",
            songsJsonCache: createFakeTextCacheStore(cachedJson),
            songsMetaResponseTimeoutMs: 10_000
        }).loadInitialSnapshot();
        await tick(0);
        await tick(5000);
        const snapshot = await loading;
        assert.equal(snapshot.source, "cache");
        assert.equal(signal.aborted, true);
        assert.deepEqual(urls, ["data/songs-meta.json"]);
    });
}

test("songs data source: late successful body is rejected even before the timeout callback runs", async (t) => {
    let now = 0;
    t.mock.method(performance, "now", () => now);
    const cachedJson = createSongsJson("cached::1", "sha256:cached");
    const songsJsonCache = createFakeTextCacheStore(cachedJson);
    let signal;
    t.mock.method(globalThis, "fetch", async (_url, options) => {
        signal = options.signal;
        return {
            ok: true,
            async text() {
                now = 5001;
                return createSongsJson("public::1", "sha256:public");
            }
        };
    });
    const snapshot = await createSongsDataSource({
        publicSongsJsonUrl: "data/songs.json",
        publicCsvUrl: "https://example.test/songs.csv",
        songsJsonCache
    }).loadInitialSnapshot();
    assert.equal(snapshot.source, "cache");
    assert.equal(signal.aborted, true);
    assert.equal(songsJsonCache.peek(), cachedJson);
});

test("songs data source: no cache keeps parallel requests and allows a body beyond five seconds", async (t) => {
    const tick = createNetworkClock(t);
    const urls = [];
    let releaseMeta;
    const publicJson = createSongsJson("public::1", "sha256:public");
    t.mock.method(globalThis, "fetch", async (url) => {
        urls.push(url);
        return {
            ok: true,
            text: () => url === "data/songs-meta.json"
                ? new Promise((resolve) => { releaseMeta = () => resolve(createSongsMetaJson("sha256:public")); })
                : new Promise((resolve) => setTimeout(() => resolve(publicJson), 6000))
        };
    });
    const loading = createSongsDataSource({
        publicSongsJsonUrl: "data/songs.json",
        publicSongsMetaUrl: "data/songs-meta.json",
        publicCsvUrl: "https://example.test/songs.csv",
        songsJsonCache: createFakeTextCacheStore()
    }).loadInitialSnapshot();
    await tick(0);
    assert.deepEqual(urls, ["data/songs-meta.json", "data/songs.json"]);
    releaseMeta();
    await tick(0);
    await tick(6000);
    const snapshot = await loading;
    assert.equal(snapshot.source, "network");
    assert.equal(snapshot.songs[0].songKey, "public::1");
});
