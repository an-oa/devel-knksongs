import test from "node:test";
import assert from "node:assert/strict";
import { createSearchCoordinator } from "../_build/app/controllers/search-coordinator.mjs";

/**
 * 検索実行 coordinator の状態と呼び出し履歴を作る。
 */
function createHarness({ hasPendingSnapshot = true } = {}) {
    const search = { debounceId: 0 };
    const calls = [];
    const coordinator = createSearchCoordinator({
        search,
        debounceMs: 60_000,
        dataLoader: {
            commitPendingSnapshot() {
                calls.push("commit");
                return hasPendingSnapshot;
            }
        },
        callbacks: {
            reconcileBookmarksAfterSongsCommitted() {
                calls.push("reconcile-bookmarks");
            }
        },
        searchController: {
            search() {
                calls.push("search");
            }
        }
    });
    return { search, calls, coordinator };
}

test("search coordinator: pending snapshot is committed immediately before search", () => {
    const { calls, coordinator } = createHarness();

    coordinator.search();

    assert.deepEqual(calls, ["commit", "reconcile-bookmarks", "search"]);
});

test("search coordinator: bookmark reconciliation is skipped without a pending snapshot", () => {
    const { calls, coordinator } = createHarness({ hasPendingSnapshot: false });

    coordinator.search();

    assert.deepEqual(calls, ["commit", "search"]);
});

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
    assert.deepEqual(calls, ["commit", "reconcile-bookmarks", "search"]);
});
