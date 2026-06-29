import test from "node:test";
import assert from "node:assert/strict";
import {
    applySearchBooleanFilterState,
    collectSearchBooleanFilterState,
    getSearchBooleanFilterElements,
    hasEnabledSearchBooleanFilter,
    hasSelectedSearchBooleanFilterState,
    resetSearchBooleanFilters,
    SEARCH_BOOLEAN_FILTER_KEYS
} from "../_build/app/lib/search-boolean-filters.mjs";

function createBooleanFilterUi() {
    return {
        el: {
            collabHostOnly: { checked: true },
            collabGuestOnly: { checked: false },
            relayOnly: { checked: true },
            harmonyOnly: { checked: false }
        }
    };
}

test("search boolean filters: collects checked UI state by shared keys", () => {
    const ui = createBooleanFilterUi();

    assert.deepEqual(SEARCH_BOOLEAN_FILTER_KEYS, [
        "collabHostOnly",
        "collabGuestOnly",
        "relayOnly",
        "harmonyOnly"
    ]);
    assert.deepEqual(collectSearchBooleanFilterState(ui), {
        collabHostOnly: true,
        collabGuestOnly: false,
        relayOnly: true,
        harmonyOnly: false
    });
});

test("search boolean filters: applies and resets UI state", () => {
    const ui = createBooleanFilterUi();

    applySearchBooleanFilterState(ui, {
        collabHostOnly: false,
        collabGuestOnly: true,
        relayOnly: false,
        harmonyOnly: true
    });

    assert.deepEqual(collectSearchBooleanFilterState(ui), {
        collabHostOnly: false,
        collabGuestOnly: true,
        relayOnly: false,
        harmonyOnly: true
    });
    assert.equal(hasEnabledSearchBooleanFilter(ui), true);

    resetSearchBooleanFilters(ui);

    assert.deepEqual(collectSearchBooleanFilterState(ui), {
        collabHostOnly: false,
        collabGuestOnly: false,
        relayOnly: false,
        harmonyOnly: false
    });
    assert.equal(hasEnabledSearchBooleanFilter(ui), false);
});

test("search boolean filters: returns existing UI elements and detects state object selections", () => {
    const ui = createBooleanFilterUi();

    assert.deepEqual(getSearchBooleanFilterElements(ui), [
        ui.el.collabHostOnly,
        ui.el.collabGuestOnly,
        ui.el.relayOnly,
        ui.el.harmonyOnly
    ]);
    assert.equal(hasSelectedSearchBooleanFilterState({ collabGuestOnly: true }), true);
    assert.equal(hasSelectedSearchBooleanFilterState({ queryRaw: "群青" }), false);
});
