import test from "node:test";
import assert from "node:assert/strict";
import { createSearchUiActions } from "../_build/app/ui/core/search-actions.mjs";

test("search actions: clear resets conditions before delegating active bookmark cleanup", () => {
    const calls = {
        filterReset: 0,
        dateReset: 0,
        directSearch: 0,
        directSave: 0,
        activeBookmarkClear: 0,
        queryAtActiveBookmarkClear: null,
        filterResetAtActiveBookmarkClear: 0
    };
    const ui = {
        el: {
            searchBox: { value: "群青" },
            searchBoxError: null
        }
    };
    const search = {
        debounceId: 0,
        dataReady: true,
        userTouchedQuery: true,
        userTouchedFilters: true
    };
    const searchController = {
        syncDateSelectOptions() {},
        scheduleSearch() {
            calls.directSearch += 1;
        },
        resetDateSelects() {
            calls.dateReset += 1;
        },
        resetDateSelectGroup() {},
        hasDateSelection() {
            return false;
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
            syncFormatCheckboxesFromState() {},
            needsFilterReset() {
                return false;
            }
        },
        getSearchController: () => searchController,
        getStorageController: () => storageController
    });

    controller.clearSearch();

    assert.equal(ui.el.searchBox.value, "");
    assert.equal(search.userTouchedQuery, false);
    assert.equal(calls.filterReset, 1);
    assert.equal(calls.dateReset, 1);
    assert.equal(calls.activeBookmarkClear, 1);
    assert.equal(calls.queryAtActiveBookmarkClear, "");
    assert.equal(calls.filterResetAtActiveBookmarkClear, 1);
    assert.equal(calls.directSearch, 0);
    assert.equal(calls.directSave, 0);
});
