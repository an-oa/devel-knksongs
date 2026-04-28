import test from "node:test";
import assert from "node:assert/strict";
import { createLegacyLocalStorageSongsJsonCacheAdapter } from "../app/lib/storage/songs-json-cache.mjs";

/**
 * songs json cache adapter テスト用の localStorage を作る。
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

test("songs json cache adapter: migrates legacy localStorage text into primary cache", async () => {
    const storage = createFakeLocalStorage();
    let primaryValue = null;
    const cache = {
        async getText() {
            return primaryValue;
        },
        async setText(value) {
            primaryValue = value;
            return true;
        },
        async removeText() {
            primaryValue = null;
        }
    };
    const adapter = createLegacyLocalStorageSongsJsonCacheAdapter({
        cache,
        legacyKey: "cachedSongsJson",
        storage
    });

    storage.setItem("cachedSongsJson", "{\"songs\":[]}");

    assert.equal(await adapter.getText(), "{\"songs\":[]}");
    assert.equal(primaryValue, "{\"songs\":[]}");
    assert.equal(storage.getItem("cachedSongsJson"), null);
});

test("songs json cache adapter: removes legacy localStorage text before retrying failed save", async () => {
    const previousConsoleWarn = console.warn;
    try {
        const storage = createFakeLocalStorage();
        let primaryValue = null;
        let setCalls = 0;
        const warnings = [];
        console.warn = (...args) => {
            warnings.push(args);
        };
        const cache = {
            async getText() {
                return primaryValue;
            },
            async setText(value) {
                setCalls += 1;
                if (setCalls === 1) {
                    throw new Error("quota exceeded");
                }
                primaryValue = value;
                return true;
            },
            async removeText() {
                primaryValue = null;
            }
        };
        const adapter = createLegacyLocalStorageSongsJsonCacheAdapter({
            cache,
            legacyKey: "cachedSongsJson",
            storage
        });

        storage.setItem("cachedSongsJson", "{\"songs\":[\"old\"]}");

        assert.equal(await adapter.setText("{\"songs\":[\"fresh\"]}"), true);
        assert.equal(setCalls, 2);
        assert.equal(primaryValue, "{\"songs\":[\"fresh\"]}");
        assert.equal(storage.getItem("cachedSongsJson"), null);
        assert.match(String(warnings[0]?.[0]), /曲データJSONキャッシュを保存できませんでした/);
    } finally {
        console.warn = previousConsoleWarn;
    }
});

test("songs json cache adapter: keeps legacy localStorage text when migration save fails", async () => {
    const previousConsoleWarn = console.warn;
    try {
        const storage = createFakeLocalStorage();
        const warnings = [];
        console.warn = (...args) => {
            warnings.push(args);
        };
        const cache = {
            async getText() {
                throw new Error("IndexedDB is not available");
            },
            async setText() {
                throw new Error("IndexedDB is not available");
            },
            async removeText() {}
        };
        const adapter = createLegacyLocalStorageSongsJsonCacheAdapter({
            cache,
            legacyKey: "cachedSongsJson",
            storage
        });

        storage.setItem("cachedSongsJson", "{\"songs\":[\"legacy\"]}");

        assert.equal(await adapter.getText(), "{\"songs\":[\"legacy\"]}");
        assert.equal(storage.getItem("cachedSongsJson"), "{\"songs\":[\"legacy\"]}");
        assert.match(String(warnings[0]?.[0]), /曲データJSONキャッシュを読み込めませんでした/);
        assert.match(String(warnings[1]?.[0]), /曲データJSONキャッシュを保存できませんでした/);
    } finally {
        console.warn = previousConsoleWarn;
    }
});
