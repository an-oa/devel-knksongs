import test from "node:test";
import assert from "node:assert/strict";
import { createStorageController } from "../app/controllers/storage.mjs";
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
            BOOKMARK_STORAGE_VERSION: 2,
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

test("loadBookmarks: main branch bookmarks payload is restored from bookmarksV1", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const storedBookmarks = {
            p_1: {
                name: "main branch payload",
                songs: ["arch1::1", "arch2::2"],
                createdAt: 1710000000000
            }
        };
        const { controller, data, getRenderCount } = setupStorageController({
            bookmarks: {},
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });
        globalThis.localStorage.setItem("bookmarksTest", JSON.stringify(storedBookmarks));

        controller.loadBookmarks();

        assert.deepEqual(data.bookmarks, storedBookmarks);
        assert.equal(getRenderCount(), 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("loadBookmarks: invalid bookmark payload is sanitized and deduplicated", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount } = setupStorageController({
            bookmarks: {},
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });
        globalThis.localStorage.setItem("bookmarksTest", JSON.stringify({
            version: 2,
            bookmarks: {
                keep: {
                    name: "  Saved List  ",
                    songs: ["song-1", "song-1", " ", 4, 4, null],
                    createdAt: 1710000000000
                },
                emptyName: {
                    name: "   ",
                    songs: ["song-2"],
                    createdAt: 1710000000001
                },
                invalid: null
            }
        }));

        controller.loadBookmarks();

        assert.deepEqual(data.bookmarks, {
            keep: {
                name: "Saved List",
                songs: ["song-1", 4],
                createdAt: 1710000000000
            }
        });
        assert.equal(getRenderCount(), 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("migrateLegacyBookmarkSongRefs: rewrites old songKey refs to bookmarkSongKey and saves versioned payload", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const storedBookmarks = {
            p_1: {
                name: "legacy payload",
                songs: ["arch1::1", "arch2::2"],
                createdAt: 1710000000000
            }
        };
        const { controller, data } = setupStorageController({
            bookmarks: {},
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });
        data.allSongsRaw = [
            {
                sourceIndex: 0,
                songKey: "arch1::1",
                bookmarkSongKey: "videoA::1",
                legacySongKey: "arch1::1::https://youtu.be/videoA"
            },
            {
                sourceIndex: 1,
                songKey: "arch2::2",
                bookmarkSongKey: "videoB::2",
                legacySongKey: "arch2::2::https://youtu.be/videoB"
            }
        ];
        globalThis.localStorage.setItem("bookmarksTest", JSON.stringify(storedBookmarks));

        controller.loadBookmarks();
        controller.migrateLegacyBookmarkSongRefs();

        assert.deepEqual(data.bookmarks, {
            p_1: {
                name: "legacy payload",
                songs: ["videoA::1", "videoB::2"],
                createdAt: 1710000000000
            }
        });
        assert.deepEqual(
            JSON.parse(globalThis.localStorage.getItem("bookmarksTest")),
            {
                version: 2,
                bookmarks: data.bookmarks
            }
        );
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("migrateLegacyBookmarkSongRefs: preserves current bookmarkSongKey refs and upgrades payload version", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const storedBookmarks = {
            p_1: {
                name: "already current refs",
                songs: ["videoA::1"],
                createdAt: 1710000000000
            }
        };
        const { controller, data } = setupStorageController({
            bookmarks: {},
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });
        data.allSongsRaw = [
            {
                sourceIndex: 0,
                songKey: "arch1::1",
                bookmarkSongKey: "videoA::1",
                legacySongKey: "arch1::1::https://youtu.be/videoA"
            }
        ];
        globalThis.localStorage.setItem("bookmarksTest", JSON.stringify(storedBookmarks));

        controller.loadBookmarks();
        controller.migrateLegacyBookmarkSongRefs();

        assert.deepEqual(
            JSON.parse(globalThis.localStorage.getItem("bookmarksTest")),
            {
                version: 2,
                bookmarks: data.bookmarks
            }
        );
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("importBookmarksFromJsonText: replaces current bookmarks and clears missing active bookmark", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const { controller, data, getRenderCount, getScheduleCount } = setupStorageController({
            bookmarks: {
                old: { name: "Old", songs: ["old-song"], createdAt: 1 }
            },
            activeBookmark: "old",
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });
        data.allSongsRaw = [
            {
                sourceIndex: 0,
                songKey: "arch1::1",
                bookmarkSongKey: "videoA::1",
                legacySongKey: "arch1::1::https://youtu.be/videoA"
            }
        ];

        const result = controller.importBookmarksFromJsonText(JSON.stringify({
            version: 1,
            bookmarks: {
                imported: {
                    name: " Imported ",
                    songs: ["arch1::1", "arch1::1"],
                    createdAt: 2
                }
            }
        }));

        assert.equal(result.ok, true);
        assert.equal(result.bookmarkCount, 1);
        assert.equal(result.songCount, 1);
        assert.deepEqual(data.bookmarks, {
            imported: {
                name: "Imported",
                songs: ["videoA::1"],
                createdAt: 2
            }
        });
        assert.equal(data.activeBookmark, null);
        assert.equal(getRenderCount(), 1);
        assert.equal(getScheduleCount(), 1);
        assert.deepEqual(JSON.parse(globalThis.localStorage.getItem("bookmarksTest")), {
            version: 2,
            bookmarks: data.bookmarks
        });
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("migrateLegacyBookmarkSongRefs: emits opt-in debug logs when migration runs", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    const previousConsoleDebug = console.debug;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const debugCalls = [];
        console.debug = (...args) => {
            debugCalls.push(args);
        };
        const storedBookmarks = {
            p_1: {
                name: "legacy payload",
                songs: ["arch1::1"],
                createdAt: 1710000000000
            }
        };
        const { controller, data } = setupStorageController({
            bookmarks: {},
            maxBookmarkCount: 20,
            maxSongsPerBookmark: 120
        });
        data.allSongsRaw = [
            {
                sourceIndex: 0,
                songKey: "arch1::1",
                bookmarkSongKey: "videoA::1",
                legacySongKey: "arch1::1::https://youtu.be/videoA"
            }
        ];
        globalThis.localStorage.setItem("debugBookmarkMigration", "true");
        globalThis.localStorage.setItem("bookmarksTest", JSON.stringify(storedBookmarks));

        controller.loadBookmarks();
        controller.migrateLegacyBookmarkSongRefs();

        assert.equal(debugCalls.length >= 3, true);
        assert.deepEqual(debugCalls[0], [
            "[bookmark-migration]",
            "loaded bookmarks payload",
            {
                storedVersion: 1,
                bookmarkCount: 1
            }
        ]);
        assert.deepEqual(debugCalls[1], [
            "[bookmark-migration]",
            "start bookmark ref migration",
            {
                storedVersion: 1,
                targetVersion: 2,
                bookmarkCount: 1,
                songRowCount: 1
            }
        ]);
        assert.deepEqual(debugCalls[2], [
            "[bookmark-migration]",
            "bookmark refs migrated",
            {
                bookmarkId: "p_1",
                before: ["arch1::1"],
                after: ["videoA::1"]
            }
        ]);
        assert.deepEqual(debugCalls[3], [
            "[bookmark-migration]",
            "saved migrated bookmarks payload",
            {
                changedBookmarkIds: ["p_1"],
                upgradedVersion: 2
            }
        ]);
    } finally {
        console.debug = previousConsoleDebug;
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("restoreSearchState: main branch payload restores into sliced ui state", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        let applyPendingCallCount = 0;
        const data = {
            allSongsRaw: [],
            bookmarks: {},
            activeBookmark: null
        };
        const ui = {
            el: {
                searchBox: { value: "" },
                relayOnly: { checked: false },
                harmonyOnly: { checked: false }
            },
            search: {
                selectedFormats: new Set(),
                userTouchedQuery: false,
                userTouchedFilters: false,
                hasRestoredSearchState: false
            },
            date: {
                bounds: { minKey: 20240210, maxKey: 20240305 },
                pendingValues: null
            }
        };
        const controller = createStorageController({
            data,
            ui,
            constants: {
                DEFAULT_FORMATS: ["配信", "歌みた", "ショート", "切り抜き"],
                SEARCH_STATE_KEY: "searchStateTest",
                BOOKMARK_STORAGE_KEY: "bookmarksTest",
                MAX_BOOKMARK_COUNT: 20,
                MAX_SONGS_PER_BOOKMARK: 120
            },
            callbacks: {
                getDateSelectValue: () => "",
                applyPendingDateValues: () => {
                    applyPendingCallCount += 1;
                    ui.date.pendingValues = null;
                },
                renderBookmarks: () => {},
                scheduleSearch: () => {}
            }
        });
        globalThis.localStorage.setItem("searchStateTest", JSON.stringify({
            query: "群青",
            relayOnly: true,
            harmonyOnly: false,
            dateFrom: "2024-02-10",
            dateTo: "2024-03-05",
            formats: ["配信", "歌みた"]
        }));

        controller.restoreSearchState();

        assert.equal(ui.el.searchBox.value, "群青");
        assert.equal(ui.el.relayOnly.checked, true);
        assert.equal(ui.el.harmonyOnly.checked, false);
        assert.deepEqual(Array.from(ui.search.selectedFormats), ["配信", "歌みた"]);
        assert.equal(ui.search.userTouchedQuery, true);
        assert.equal(ui.search.userTouchedFilters, true);
        assert.equal(ui.search.hasRestoredSearchState, true);
        assert.equal(ui.date.pendingValues, null);
        assert.equal(applyPendingCallCount, 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("restoreSearchState: invalid saved formats fall back to defaults and sync checkboxes", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const formatCheckboxes = [
            { value: "配信", checked: false },
            { value: "歌みた", checked: false }
        ];
        document.querySelectorAll = (selector) => {
            assert.equal(selector, '#formatsList input[type="checkbox"]');
            return formatCheckboxes;
        };
        const ui = {
            el: {
                searchBox: { value: "" },
                relayOnly: { checked: false },
                harmonyOnly: { checked: false }
            },
            search: {
                selectedFormats: new Set(["旧値"]),
                userTouchedQuery: false,
                userTouchedFilters: false,
                hasRestoredSearchState: false
            },
            date: {
                bounds: null,
                pendingValues: null
            }
        };
        const controller = createStorageController({
            data: {
                allSongsRaw: [],
                bookmarks: {},
                activeBookmark: null
            },
            ui,
            constants: {
                DEFAULT_FORMATS: ["配信", "歌みた"],
                SEARCH_STATE_KEY: "searchStateTest",
                BOOKMARK_STORAGE_KEY: "bookmarksTest",
                MAX_BOOKMARK_COUNT: 20,
                MAX_SONGS_PER_BOOKMARK: 120
            },
            callbacks: {
                getDateSelectValue: () => "",
                applyPendingDateValues: () => {},
                renderBookmarks: () => {},
                scheduleSearch: () => {}
            }
        });
        globalThis.localStorage.setItem("searchStateTest", JSON.stringify({
            query: "",
            relayOnly: false,
            harmonyOnly: false,
            dateFrom: "",
            dateTo: "",
            formats: ["存在しない形式"]
        }));

        controller.restoreSearchState();

        assert.deepEqual(Array.from(ui.search.selectedFormats), ["配信", "歌みた"]);
        assert.equal(formatCheckboxes[0].checked, true);
        assert.equal(formatCheckboxes[1].checked, true);
        assert.equal(ui.search.hasRestoredSearchState, true);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

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
