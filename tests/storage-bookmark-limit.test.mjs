import test from "node:test";
import assert from "node:assert/strict";
import { createStorageController } from "../app/controllers/storage.mjs";

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

function setupStorageController({ bookmarks, activeBookmark, maxBookmarkCount, maxSongsPerBookmark }) {
    let renderCount = 0;
    let scheduleCount = 0;
    const data = {
        allSongsRaw: [],
        bookmarks: JSON.parse(JSON.stringify(bookmarks || {})),
        activeBookmark: activeBookmark || null
    };
    const ui = {
        selectedFormats: new Set(),
        el: {}
    };
    const controller = createStorageController({
        data,
        ui,
        constants: {
            DEFAULT_FORMATS: [],
            SEARCH_STATE_KEY: "searchStateTest",
            BOOKMARK_STORAGE_KEY: "bookmarksTest",
            MAX_BOOKMARK_COUNT: maxBookmarkCount,
            MAX_SONGS_PER_BOOKMARK: maxSongsPerBookmark
        },
        callbacks: {
            getDateSelectValue: () => "",
            applyPendingDateValues: () => {},
            renderBookmarks: () => { renderCount += 1; },
            scheduleSearch: () => { scheduleCount += 1; }
        }
    });
    return {
        controller,
        data,
        getRenderCount: () => renderCount,
        getScheduleCount: () => scheduleCount
    };
}

test("createBookmarkAndAdd: rejects when bookmark count limit is reached", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data } = setupStorageController({
            bookmarks: {
                b1: { name: "A", songs: ["s1"], createdAt: 1 },
                b2: { name: "B", songs: ["s2"], createdAt: 2 }
            },
            maxBookmarkCount: 2,
            maxSongsPerBookmark: 50
        });

        const result = controller.createBookmarkAndAdd("C", "s3");
        assert.equal(result.ok, false);
        assert.equal(result.reason, "max_bookmark_count");
        assert.equal(result.limit, 2);
        assert.equal(Object.keys(data.bookmarks).length, 2);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("createBookmark: succeeds under limit and creates empty bookmark", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount, getScheduleCount } = setupStorageController({
            bookmarks: {
                b1: { name: "A", songs: ["s1"], createdAt: 1 }
            },
            activeBookmark: null,
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });

        const result = controller.createBookmark("B");
        assert.equal(result.ok, true);
        assert.equal(typeof result.id, "string");
        assert.equal(data.bookmarks[result.id].name, "B");
        assert.deepEqual(data.bookmarks[result.id].songs, []);
        assert.equal(getRenderCount(), 1);
        assert.equal(getScheduleCount(), 0);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("addSongToBookmark: rejects when per-bookmark song limit is reached", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount, getScheduleCount } = setupStorageController({
            bookmarks: {
                b1: { name: "A", songs: ["s1", "s2"], createdAt: 1 }
            },
            activeBookmark: "b1",
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 2
        });

        const result = controller.addSongToBookmark("b1", "s3");
        assert.equal(result.ok, false);
        assert.equal(result.reason, "max_songs_per_bookmark");
        assert.equal(result.limit, 2);
        assert.equal(data.bookmarks.b1.songs.length, 2);
        assert.equal(getRenderCount(), 0);
        assert.equal(getScheduleCount(), 0);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("addSongToBookmark: succeeds under limit and triggers render/search for active bookmark", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount, getScheduleCount } = setupStorageController({
            bookmarks: {
                b1: { name: "A", songs: ["s1"], createdAt: 1 }
            },
            activeBookmark: "b1",
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 2
        });

        const result = controller.addSongToBookmark("b1", "s2");
        assert.equal(result.ok, true);
        assert.deepEqual(data.bookmarks.b1.songs, ["s1", "s2"]);
        assert.equal(getRenderCount(), 1);
        assert.equal(getScheduleCount(), 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("renameBookmark: rejects invalid input and keeps state unchanged", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount, getScheduleCount } = setupStorageController({
            bookmarks: {
                b1: { name: "A", songs: ["s1"], createdAt: 1 }
            },
            activeBookmark: "b1",
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });

        const invalidTypeResult = controller.renameBookmark("b1", null);
        assert.equal(invalidTypeResult.ok, false);
        assert.equal(invalidTypeResult.reason, "invalid_name_type");

        const emptyNameResult = controller.renameBookmark("b1", "   ");
        assert.equal(emptyNameResult.ok, false);
        assert.equal(emptyNameResult.reason, "empty_name");

        assert.equal(data.bookmarks.b1.name, "A");
        assert.equal(getRenderCount(), 0);
        assert.equal(getScheduleCount(), 0);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("renameBookmark: same name is no-op", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount, getScheduleCount } = setupStorageController({
            bookmarks: {
                b1: { name: "A", songs: ["s1"], createdAt: 1 }
            },
            activeBookmark: "b1",
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });

        const result = controller.renameBookmark("b1", "A");
        assert.equal(result.ok, true);
        assert.equal(result.changed, false);
        assert.equal(data.bookmarks.b1.name, "A");
        assert.equal(getRenderCount(), 0);
        assert.equal(getScheduleCount(), 0);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("renameBookmark: active bookmark rename triggers render and search", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount, getScheduleCount } = setupStorageController({
            bookmarks: {
                b1: { name: "A", songs: ["s1"], createdAt: 1 }
            },
            activeBookmark: "b1",
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });

        const result = controller.renameBookmark("b1", "B");
        assert.equal(result.ok, true);
        assert.equal(result.changed, true);
        assert.equal(data.bookmarks.b1.name, "B");
        assert.equal(getRenderCount(), 1);
        assert.equal(getScheduleCount(), 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("renameBookmark: inactive bookmark rename triggers render only", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount, getScheduleCount } = setupStorageController({
            bookmarks: {
                b1: { name: "A", songs: ["s1"], createdAt: 1 }
            },
            activeBookmark: null,
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });

        const result = controller.renameBookmark("b1", "B");
        assert.equal(result.ok, true);
        assert.equal(result.changed, true);
        assert.equal(data.bookmarks.b1.name, "B");
        assert.equal(getRenderCount(), 1);
        assert.equal(getScheduleCount(), 0);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});
