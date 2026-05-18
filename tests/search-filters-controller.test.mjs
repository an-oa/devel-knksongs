import test from "node:test";
import assert from "node:assert/strict";
import { createSearchFiltersController } from "../app/ui/search-filters/controller.mjs";
import { FRAME_SCOPE_ALL, FRAME_SCOPE_GUEST, FRAME_SCOPE_OWN } from "../app/lib/frame-scope-filter.mjs";
import { installFakeDom, invokeListener } from "./test-helpers.mjs";

function createFormatCheckbox(value, checked = false) {
    return { value, checked };
}

function createSearchFiltersUiState() {
    const formatCheckboxes = [
        createFormatCheckbox("配信"),
        createFormatCheckbox("歌みた"),
        createFormatCheckbox("ショート")
    ];
    const formatsList = {
        querySelectorAll: (selector) => {
            assert.equal(selector, 'input[type="checkbox"]');
            return formatCheckboxes;
        }
    };
    const frameScopeInputs = [
        { value: FRAME_SCOPE_ALL, checked: true },
        { value: FRAME_SCOPE_OWN, checked: false },
        { value: FRAME_SCOPE_GUEST, checked: false }
    ];
    const frameScopeOptions = {
        childElementCount: frameScopeInputs.length,
        querySelectorAll: (selector) => {
            assert.equal(selector, 'input[name="frameScope"]');
            return frameScopeInputs;
        }
    };
    return {
        el: {
            relayOnly: { checked: true },
            harmonyOnly: { checked: true },
            formatsList,
            frameScopeOptions
        },
        search: {
            selectedFormats: new Set(["ショート"]),
            userTouchedFilters: true
        },
        date: {
            pendingValues: { from: "2024-01-01", to: "2024-12-31" }
        },
        formatCheckboxes,
        frameScopeInputs
    };
}

test("createSearchFiltersController: resets filter UI state to defaults", () => {
    const ui = createSearchFiltersUiState();
    const controller = createSearchFiltersController({
        ui,
        defaultFormats: ["配信", "歌みた"]
    });
    let resetDateCallCount = 0;
    controller.renderFilterOptions();
    controller.applyFrameScopeValue(FRAME_SCOPE_GUEST);

    controller.resetFiltersToDefault({
        resetDateSelects: () => {
            resetDateCallCount += 1;
        }
    });

    assert.equal(ui.el.relayOnly.checked, false);
    assert.equal(ui.el.harmonyOnly.checked, false);
    assert.deepEqual(Array.from(ui.search.selectedFormats), ["配信", "歌みた"]);
    assert.deepEqual(ui.formatCheckboxes.map((checkbox) => checkbox.checked), [true, true, false]);
    assert.equal(controller.getSelectedFrameScopeValue(), FRAME_SCOPE_ALL);
    assert.equal(ui.date.pendingValues, null);
    assert.equal(ui.search.userTouchedFilters, false);
    assert.equal(resetDateCallCount, 1);
});

test("createSearchFiltersController: detects non-default filter states", () => {
    const ui = createSearchFiltersUiState();
    const controller = createSearchFiltersController({
        ui,
        defaultFormats: ["配信", "歌みた"]
    });
    controller.renderFilterOptions();
    controller.resetFiltersToDefault();

    assert.equal(controller.needsFilterReset({ hasDateSelection: () => false }), false);

    ui.el.relayOnly.checked = true;
    assert.equal(controller.needsFilterReset({ hasDateSelection: () => false }), true);
    ui.el.relayOnly.checked = false;

    ui.search.selectedFormats.delete("歌みた");
    assert.equal(controller.needsFilterReset({ hasDateSelection: () => false }), true);
    controller.setSelectedFormatsToDefault();

    controller.applyFrameScopeValue(FRAME_SCOPE_GUEST);
    assert.equal(controller.needsFilterReset({ hasDateSelection: () => false }), true);
    controller.setFrameScopeToDefault();

    assert.equal(controller.needsFilterReset({ hasDateSelection: () => true }), true);
});

test("createSearchFiltersController: applies normalized stored filter state through the facade", () => {
    const ui = createSearchFiltersUiState();
    const controller = createSearchFiltersController({
        ui,
        defaultFormats: ["配信", "歌みた", "ショート", "切り抜き", "収録"]
    });
    controller.renderFilterOptions();

    controller.applyStoredFilterState({
        relayOnly: true,
        harmonyOnly: false,
        frameScope: FRAME_SCOPE_GUEST,
        formats: ["配信", "歌みた", "ショート", "切り抜き", "収録"]
    });

    assert.equal(ui.el.relayOnly.checked, true);
    assert.equal(ui.el.harmonyOnly.checked, false);
    assert.equal(controller.getSelectedFrameScopeValue(), FRAME_SCOPE_GUEST);
    assert.deepEqual(controller.getSelectedFormatValues(), ["配信", "歌みた", "ショート", "切り抜き", "収録"]);
    assert.deepEqual(ui.formatCheckboxes.map((checkbox) => checkbox.checked), [true, true, true]);
});

test("createSearchFiltersController: sets up format and frame scope filter options", () => {
    const restoreDom = installFakeDom();
    try {
        const formatsList = document.createElement("div");
        const frameScopeOptions = document.createElement("div");
        const ui = {
            el: {
                relayOnly: { checked: false },
                harmonyOnly: { checked: false },
                formatsList,
                frameScopeOptions
            },
            search: {
                selectedFormats: new Set(),
                userTouchedFilters: false
            },
            date: {
                pendingValues: null
            }
        };
        const controller = createSearchFiltersController({
            ui,
            defaultFormats: ["配信", "歌みた"]
        });
        let filterChangeCount = 0;

        controller.setupFilterOptions({
            onFilterChange: () => {
                filterChangeCount += 1;
            }
        });

        assert.equal(formatsList.childElementCount, 2);
        assert.equal(frameScopeOptions.childElementCount, 3);
        assert.deepEqual(controller.getSelectedFormatValues(), ["配信", "歌みた"]);

        const secondFormatCheckbox = formatsList.children[1].firstChild;
        secondFormatCheckbox.checked = false;
        invokeListener(secondFormatCheckbox, "change", { target: secondFormatCheckbox });

        assert.deepEqual(controller.getSelectedFormatValues(), ["配信"]);
        assert.equal(filterChangeCount, 1);

        const guestFrameScopeInput = frameScopeOptions.children[2].firstChild;
        frameScopeOptions.querySelectorAll('input[name="frameScope"]').forEach((input) => {
            input.checked = false;
        });
        guestFrameScopeInput.checked = true;
        invokeListener(guestFrameScopeInput, "change", { target: guestFrameScopeInput });

        assert.equal(controller.getSelectedFrameScopeValue(), FRAME_SCOPE_GUEST);
        assert.equal(filterChangeCount, 2);

        controller.setupFilterOptions({
            onFilterChange: () => {
                throw new Error("should not register duplicate listeners");
            }
        });

        assert.equal(formatsList.childElementCount, 2);
        assert.equal(frameScopeOptions.childElementCount, 3);
    } finally {
        restoreDom();
    }
});
