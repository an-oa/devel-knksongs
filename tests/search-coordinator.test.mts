import test from "node:test";
import assert from "node:assert/strict";
import { createSearchCoordinator } from "../app/controllers/search-coordinator.mts";

/**
 * 検索実行 coordinator の状態と呼び出し履歴を作る。
 */
function createHarness() {
    const calls: string[] = [];
    const coordinator = createSearchCoordinator({
        debounceMs: 60_000,
        searchController: {
            search() {
                calls.push("search");
            },
            refreshRecommendedDisplay() {
                calls.push("refresh");
                return true;
            }
        }
    });
    return { calls, coordinator };
}

test("search coordinator: cancellation and immediate search prevent delayed duplicate searches", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { calls, coordinator } = createHarness();

    coordinator.scheduleSearch();
    coordinator.cancelScheduledSearch();
    t.mock.timers.tick(60_000);
    assert.deepEqual(calls, []);

    coordinator.scheduleSearch();
    t.mock.timers.tick(59_999);
    assert.deepEqual(calls, []);

    coordinator.scheduleSearch({ immediate: true });
    assert.deepEqual(calls, ["search"]);
    t.mock.timers.tick(60_000);
    assert.deepEqual(calls, ["search"]);
});

test("search coordinator: viewport expansion waits for a scheduled search to commit", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { calls, coordinator } = createHarness();
    assert.equal(coordinator.refreshRecommendedDisplay(), true);
    coordinator.scheduleSearch();
    assert.equal(coordinator.refreshRecommendedDisplay(), false);
    assert.deepEqual(calls, ["refresh"]);

    t.mock.timers.tick(60_000);
    assert.equal(coordinator.refreshRecommendedDisplay(), true);
    assert.deepEqual(calls, ["refresh", "search", "refresh"]);

    coordinator.scheduleSearch();
    coordinator.cancelScheduledSearch();
    assert.equal(coordinator.refreshRecommendedDisplay(), true);
});

test("search coordinator: direct search consumes a pending reservation", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { calls, coordinator } = createHarness();
    coordinator.scheduleSearch();
    coordinator.search();
    assert.equal(coordinator.refreshRecommendedDisplay(), true);
    t.mock.timers.tick(60_000);
    assert.deepEqual(calls, ["search", "refresh"]);
});

test("search coordinator: separate instances keep independent search reservations", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const first = createHarness();
    const second = createHarness();

    first.coordinator.scheduleSearch();
    second.coordinator.scheduleSearch();
    first.coordinator.cancelScheduledSearch();
    assert.equal(second.coordinator.refreshRecommendedDisplay(), false);

    t.mock.timers.tick(60_000);
    assert.deepEqual(first.calls, []);
    assert.deepEqual(second.calls, ["search"]);

    first.coordinator.scheduleSearch();
    t.mock.timers.tick(60_000);
    assert.deepEqual(first.calls, ["search"]);
    assert.deepEqual(second.calls, ["search"]);
});
