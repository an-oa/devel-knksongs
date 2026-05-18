import test from "node:test";
import assert from "node:assert/strict";
import { createStorageController } from "../app/controllers/storage.mjs";
import { createSearchFiltersController } from "../app/ui/search-filters/controller.mjs";
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
 * storage コントローラーへ検索条件 UI controller を注入して作る。
 * @param {{ data: object, ui: object, constants: object, callbacks: object }} input
 * @returns {object}
 */
function createStorageControllerForTest(input) {
    return createStorageController({
        ...input,
        searchFiltersController: createSearchFiltersController({
            ui: input.ui,
            defaultFormats: input.constants.DEFAULT_FORMATS
        })
    });
}

test("restoreSearchState: main branch payload restores into sliced ui state", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        let applyPendingCallCount = 0;
        const frameScopeInputs = [
            { value: "all", checked: true },
            { value: "own", checked: false },
            { value: "guest", checked: false }
        ];
        const data = {
            allSongsRaw: [],
            bookmarks: {},
            activeBookmark: null
        };
        const ui = {
            el: {
                searchBox: { value: "" },
                relayOnly: { checked: false },
                harmonyOnly: { checked: false },
                frameScopeOptions: {
                    querySelectorAll: (selector) => {
                        assert.equal(selector, "input[name=\"frameScope\"]");
                        return frameScopeInputs;
                    }
                }
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
        const controller = createStorageControllerForTest({
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
            frameScope: "guest",
            dateFrom: "2024-02-10",
            dateTo: "2024-03-05",
            formats: ["配信", "歌みた"]
        }));

        controller.restoreSearchState();

        assert.equal(ui.el.searchBox.value, "群青");
        assert.equal(ui.el.relayOnly.checked, true);
        assert.equal(ui.el.harmonyOnly.checked, false);
        assert.equal(frameScopeInputs[0].checked, false);
        assert.equal(frameScopeInputs[2].checked, true);
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

test("saveSearchState: writes current schema version", () => {
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const frameScopeInputs = [
            { value: "all", checked: false },
            { value: "own", checked: true }
        ];
        const ui = {
            el: {
                searchBox: { value: "群青" },
                relayOnly: { checked: true },
                harmonyOnly: { checked: false },
                frameScopeOptions: {
                    querySelectorAll: (selector) => {
                        assert.equal(selector, "input[name=\"frameScope\"]");
                        return frameScopeInputs;
                    }
                }
            },
            search: {
                selectedFormats: new Set(["配信", "収録"])
            },
            date: {
                bounds: null,
                pendingValues: null
            }
        };
        const controller = createStorageControllerForTest({
            data: {
                allSongsRaw: [],
                bookmarks: {},
                activeBookmark: null
            },
            ui,
            constants: {
                DEFAULT_FORMATS: ["配信", "歌みた", "ショート", "切り抜き", "収録"],
                SEARCH_STATE_KEY: "searchStateTest",
                BOOKMARK_STORAGE_KEY: "bookmarksTest",
                MAX_BOOKMARK_COUNT: 20,
                MAX_SONGS_PER_BOOKMARK: 120
            },
            callbacks: {
                getDateSelectValue: (kind) => kind === "from" ? "2024" : "",
                applyPendingDateValues: () => {},
                renderBookmarks: () => {},
                scheduleSearch: () => {}
            }
        });

        controller.saveSearchState();

        const parsed = JSON.parse(globalThis.localStorage.getItem("searchStateTest"));
        assert.equal(parsed.version, 2);
        assert.equal(parsed.query, "群青");
        assert.equal(parsed.relayOnly, true);
        assert.equal(parsed.harmonyOnly, false);
        assert.equal(parsed.frameScope, "own");
        assert.equal(parsed.dateFrom, "2024");
        assert.equal(parsed.dateTo, "");
        assert.deepEqual(parsed.formats, ["配信", "収録"]);
    } finally {
        globalThis.localStorage = prevLocalStorage;
    }
});

test("restoreSearchState: legacy all-format state includes recording in new defaults", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const defaultFormats = ["配信", "歌みた", "ショート", "切り抜き", "収録"];
        const formatCheckboxes = defaultFormats.map((value) => ({ value, checked: false }));
        const formatsList = {
            querySelectorAll: (selector) => {
                assert.equal(selector, 'input[type="checkbox"]');
                return formatCheckboxes;
            }
        };
        const ui = {
            el: {
                searchBox: { value: "" },
                relayOnly: { checked: false },
                harmonyOnly: { checked: false },
                formatsList
            },
            search: {
                selectedFormats: new Set(),
                userTouchedQuery: false,
                userTouchedFilters: false,
                hasRestoredSearchState: false
            },
            date: {
                bounds: null,
                pendingValues: null
            }
        };
        const controller = createStorageControllerForTest({
            data: {
                allSongsRaw: [],
                bookmarks: {},
                activeBookmark: null
            },
            ui,
            constants: {
                DEFAULT_FORMATS: defaultFormats,
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
            formats: ["配信", "歌みた", "ショート", "切り抜き"]
        }));

        controller.restoreSearchState();

        assert.deepEqual(Array.from(ui.search.selectedFormats), defaultFormats);
        assert.deepEqual(formatCheckboxes.map((checkbox) => checkbox.checked), [true, true, true, true, true]);
        assert.equal(ui.search.hasRestoredSearchState, true);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("restoreSearchState: current payload keeps recording unchecked when user saved it off", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const defaultFormats = ["配信", "歌みた", "ショート", "切り抜き", "収録"];
        const formatCheckboxes = defaultFormats.map((value) => ({ value, checked: false }));
        const formatsList = {
            querySelectorAll: (selector) => {
                assert.equal(selector, 'input[type="checkbox"]');
                return formatCheckboxes;
            }
        };
        const ui = {
            el: {
                searchBox: { value: "" },
                relayOnly: { checked: false },
                harmonyOnly: { checked: false },
                formatsList
            },
            search: {
                selectedFormats: new Set(),
                userTouchedQuery: false,
                userTouchedFilters: false,
                hasRestoredSearchState: false
            },
            date: {
                bounds: null,
                pendingValues: null
            }
        };
        const controller = createStorageControllerForTest({
            data: {
                allSongsRaw: [],
                bookmarks: {},
                activeBookmark: null
            },
            ui,
            constants: {
                DEFAULT_FORMATS: defaultFormats,
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
            version: 2,
            query: "",
            relayOnly: false,
            harmonyOnly: false,
            frameScope: "all",
            dateFrom: "",
            dateTo: "",
            formats: ["配信", "歌みた", "ショート", "切り抜き"]
        }));

        controller.restoreSearchState();

        assert.deepEqual(Array.from(ui.search.selectedFormats), ["配信", "歌みた", "ショート", "切り抜き"]);
        assert.deepEqual(formatCheckboxes.map((checkbox) => checkbox.checked), [true, true, true, true, false]);
        assert.equal(ui.search.hasRestoredSearchState, true);
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
        const formatsList = {
            querySelectorAll: (selector) => {
                assert.equal(selector, 'input[type="checkbox"]');
                return formatCheckboxes;
            }
        };
        const ui = {
            el: {
                searchBox: { value: "" },
                relayOnly: { checked: false },
                harmonyOnly: { checked: false },
                formatsList
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
        const controller = createStorageControllerForTest({
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
