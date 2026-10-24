import test from "node:test";
import assert from "node:assert/strict";
import { createSearchUiActions } from "../app/ui/core/search-actions.mts";
import { installFakeDom, invokeListener } from "./test-helpers.mts";
import type { SiteLanguage } from "../app/lib/site-language.mts";

test("search actions: clear resets conditions before delegating active bookmark cleanup", () => {
    const calls = {
        filterReset: 0,
        dateReset: 0,
        cancelSearch: 0,
        directSearch: 0,
        directSave: 0,
        activeBookmarkClear: 0,
        queryAtActiveBookmarkClear: null as string | null,
        filterResetAtActiveBookmarkClear: 0
    };
    const ui = {
        el: {
            searchBox: { value: "群青" },
            searchBoxError: null
        },
        language: { current: "ja" as SiteLanguage }
    };
    const search = {
        dataReady: true,
        userTouchedQuery: true,
        userTouchedFilters: true
    };
    const dateFilterController = {
        resetDateSelects() {
            calls.dateReset += 1;
        },
        hasDateSelection() {
            return false;
        },
        commitDateSelectionClear() {}
    };
    const searchCoordinator = {
        cancelScheduledSearch() {
            calls.cancelSearch += 1;
        },
        scheduleSearch() {
            calls.directSearch += 1;
        }
    };
    const storageController = {
        saveSearchState() {
            calls.directSave += 1;
        },
        clearActiveBookmark() {
            calls.activeBookmarkClear += 1;
            calls.queryAtActiveBookmarkClear = ui.el.searchBox.value;
            calls.filterResetAtActiveBookmarkClear = calls.filterReset;
        }
    };
    const controller = createSearchUiActions({
        ui,
        search,
        searchFiltersController: {
            resetFiltersToDefault({ resetDateSelects }) {
                calls.filterReset += 1;
                resetDateSelects();
            },
            setSelectedFormatsToDefault() {},
            syncFormatCheckboxesFromState() {},
            needsFilterReset() {
                return false;
            }
        },
        dateFilterController,
        searchCoordinator,
        storageController
    });

    controller.clearSearch();

    assert.equal(ui.el.searchBox.value, "");
    assert.equal(search.userTouchedQuery, false);
    assert.equal(calls.filterReset, 1);
    assert.equal(calls.dateReset, 1);
    assert.equal(calls.cancelSearch, 1);
    assert.equal(calls.activeBookmarkClear, 1);
    assert.equal(calls.queryAtActiveBookmarkClear, "");
    assert.equal(calls.filterResetAtActiveBookmarkClear, 1);
    assert.equal(calls.directSearch, 0);
    assert.equal(calls.directSave, 0);
});

test("search actions: query and filters are both synchronized before a single search", () => {
    const ui = { el: { searchBox: { value: "stale query" } }, language: { current: "ja" as SiteLanguage } };
    const search = { dataReady: true, userTouchedQuery: false, userTouchedFilters: false };
    let filtersNeedReset = true;
    let dateSelected = true;
    const calls: string[] = [];
    const controller = createSearchUiActions({
        ui,
        search,
        searchFiltersController: {
            setSelectedFormatsToDefault: () => {},
            syncFormatCheckboxesFromState: () => { calls.push("sync formats"); },
            needsFilterReset: () => filtersNeedReset,
            resetFiltersToDefault: ({ resetDateSelects }) => {
                filtersNeedReset = false;
                resetDateSelects();
            }
        },
        dateFilterController: {
            resetDateSelects: () => { dateSelected = false; },
            hasDateSelection: () => dateSelected,
            commitDateSelectionClear: () => {}
        },
        searchCoordinator: {
            cancelScheduledSearch: () => {},
            scheduleSearch: (options) => {
                assert.equal(ui.el.searchBox.value, "");
                assert.equal(filtersNeedReset, false);
                assert.equal(dateSelected, false);
                assert.deepEqual(options, { immediate: true });
                calls.push("search");
            }
        },
        storageController: { saveSearchState: () => {}, clearActiveBookmark: () => {} }
    });
    controller.syncSearchUI();
    assert.deepEqual(calls, ["sync formats", "search"]);
});

/**
 * search actions が委譲する controller を、呼び出し順を記録するモックとして作る。
 * @param calls 呼び出し名を追記する配列
 */
function createRecordingDependencies(calls: string[]): Pick<
    Parameters<typeof createSearchUiActions>[0],
    "searchFiltersController" | "dateFilterController" | "searchCoordinator" | "storageController"
> {
    return {
        searchFiltersController: {
            resetFiltersToDefault: () => { calls.push("reset filters"); },
            setSelectedFormatsToDefault: () => { calls.push("default formats"); },
            syncFormatCheckboxesFromState: () => { calls.push("sync formats"); },
            needsFilterReset: () => false
        },
        dateFilterController: {
            resetDateSelects: () => {},
            hasDateSelection: () => false,
            commitDateSelectionClear: (kind) => { calls.push(`clear date ${kind}`); }
        },
        searchCoordinator: {
            cancelScheduledSearch: () => { calls.push("cancel"); },
            scheduleSearch: (options) => { calls.push(`search ${options?.immediate ? "immediate" : "debounced"}`); }
        },
        storageController: {
            saveSearchState: () => { calls.push("save"); },
            clearActiveBookmark: () => { calls.push("clear bookmark"); }
        }
    };
}

/**
 * 条件の個別解除を検証するため、呼び出し順を記録する search actions を作る。
 */
function createRecordingActions() {
    const calls: string[] = [];
    const ui = {
        el: {
            searchBox: { value: "群青" },
            searchBoxError: null,
            relayOnly: { checked: true },
            harmonyOnly: { checked: true }
        },
        language: { current: "ja" as SiteLanguage }
    };
    const search = { dataReady: true, userTouchedQuery: false, userTouchedFilters: false };
    const controller = createSearchUiActions({
        ui,
        search,
        ...createRecordingDependencies(calls)
    });
    return { calls, ui, search, controller };
}

test("search actions: clearing one condition updates state before a single immediate search and save", () => {
    const query = createRecordingActions();
    query.controller.clearSearchQuery();
    assert.equal(query.ui.el.searchBox.value, "");
    assert.equal(query.search.userTouchedQuery, true);
    assert.deepEqual(query.calls, ["cancel", "search immediate", "save"]);

    const formats = createRecordingActions();
    formats.controller.resetFormatFilters();
    assert.equal(formats.search.userTouchedFilters, true);
    assert.deepEqual(formats.calls, ["default formats", "sync formats", "search immediate", "save"]);

    const flag = createRecordingActions();
    flag.controller.clearBooleanFilter("relayOnly");
    assert.equal(flag.ui.el.relayOnly.checked, false);
    assert.equal(flag.ui.el.harmonyOnly.checked, true);
    assert.deepEqual(flag.calls, ["search immediate", "save"]);

    const date = createRecordingActions();
    date.controller.clearDateFilter("to");
    assert.deepEqual(date.calls, ["clear date to"]);
});

test("search actions: form handlers mark query and filter changes and clear the search", () => {
    const restoreDom = installFakeDom();
    try {
        const calls: string[] = [];
        const ui = {
            el: {
                searchBox: document.createElement("input"),
                searchBoxError: document.createElement("p"),
                clearBtn: document.createElement("button"),
                collabHostOnly: document.createElement("input"),
                collabGuestOnly: document.createElement("input"),
                relayOnly: document.createElement("input"),
                harmonyOnly: document.createElement("input")
            },
            language: { current: "ja" as SiteLanguage }
        };
        ui.el.searchBoxError.hidden = true;
        const search = { dataReady: true, userTouchedQuery: false, userTouchedFilters: false };
        const controller = createSearchUiActions({
            ui,
            search,
            ...createRecordingDependencies(calls)
        });
        controller.setupSearchFormHandlers();

        ui.el.relayOnly.checked = true;
        invokeListener(ui.el.relayOnly, "change", { target: ui.el.relayOnly });
        assert.equal(search.userTouchedFilters, true);
        assert.deepEqual(calls.splice(0), ["search debounced", "save"]);

        ui.el.searchBox.value = "since:2024-13";
        invokeListener(ui.el.searchBox, "input", { target: ui.el.searchBox });
        assert.equal(search.userTouchedQuery, true);
        assert.deepEqual(calls.splice(0), ["search debounced", "save"]);
        assert.equal(ui.el.searchBoxError.hidden, true);

        invokeListener(ui.el.searchBox, "blur", { target: ui.el.searchBox });
        assert.equal(ui.el.searchBoxError.hidden, false);
        assert.equal(ui.el.searchBox.getAttribute("aria-invalid"), "true");
        assert.deepEqual(calls, []);

        ui.el.searchBox.value = "since:2024-12";
        invokeListener(ui.el.searchBox, "input", { target: ui.el.searchBox });
        assert.equal(ui.el.searchBoxError.hidden, true);
        assert.equal(ui.el.searchBox.getAttribute("aria-invalid"), null);
        assert.deepEqual(calls.splice(0), ["search debounced", "save"]);

        invokeListener(ui.el.clearBtn, "click", {});
        assert.equal(ui.el.searchBox.value, "");
        assert.equal(search.userTouchedQuery, false);
        assert.deepEqual(calls, ["cancel", "reset filters", "clear bookmark"]);
    } finally {
        restoreDom();
    }
});
