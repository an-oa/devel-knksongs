import test from "node:test";
import assert from "node:assert/strict";
import { createSearchCoordinator } from "../_build/app/controllers/search-coordinator.mjs";

/**
 * 検索実行 coordinator の状態と呼び出し履歴を作る。
 */
function createHarness() {
    const search = { debounceId: 0 };
    const calls = [];
    const coordinator = createSearchCoordinator({
        search,
        debounceMs: 60_000,
        searchController: {
            search() {
                calls.push("search");
            }
        }
    });
    return { search, calls, coordinator };
}

test("search coordinator: cancellation and immediate search clear the pending debounce id", () => {
    const { search, calls, coordinator } = createHarness();

    coordinator.scheduleSearch();
    assert.notEqual(search.debounceId, 0);

    coordinator.cancelScheduledSearch();
    assert.equal(search.debounceId, 0);
    assert.deepEqual(calls, []);

    coordinator.scheduleSearch();
    assert.notEqual(search.debounceId, 0);

    coordinator.scheduleSearch({ immediate: true });
    assert.equal(search.debounceId, 0);
    assert.deepEqual(calls, ["search"]);
});
