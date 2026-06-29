import test from "node:test";
import assert from "node:assert/strict";
import { createUiSyncController } from "../_build/app/ui/core/sync.mjs";
import { installFakeDom } from "./test-helpers.mjs";

/**
 * UI sync テスト用のスパイ群を作る。
 * @returns {*}
 */
function createUiSyncSpies() {
    const calls = {
        syncSearchUI: 0,
        applyThemeFromStorage: 0,
        applyPlaybackSettingsFromStorage: 0
    };

    return {
        calls,
        input: {
            uiSyncPasses: 1,
            syncSearchUI() {
                calls.syncSearchUI += 1;
            },
            applyThemeFromStorage() {
                calls.applyThemeFromStorage += 1;
            },
            applyPlaybackSettingsFromStorage() {
                calls.applyPlaybackSettingsFromStorage += 1;
            }
        }
    };
}

test("ui sync: scheduleSyncUiState runs multiple passes and respects visual/search options", () => {
    const restoreDom = installFakeDom();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const frameQueue = [];
    globalThis.requestAnimationFrame = (callback) => {
        frameQueue.push(callback);
        return frameQueue.length;
    };
    try {
        const { calls, input } = createUiSyncSpies();
        const controller = createUiSyncController({
            ...input,
            uiSyncPasses: 2
        });

        controller.scheduleSyncUiState({ search: false });
        assert.equal(calls.applyThemeFromStorage, 1);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 1);
        assert.equal(calls.syncSearchUI, 0);
        assert.equal(frameQueue.length, 1);

        frameQueue.shift()();
        assert.equal(calls.applyThemeFromStorage, 2);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 2);
        assert.equal(calls.syncSearchUI, 0);

        controller.scheduleSyncUiState({ visual: false });
        assert.equal(calls.applyThemeFromStorage, 2);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 2);
        assert.equal(calls.syncSearchUI, 1);
        assert.equal(frameQueue.length, 1);

        frameQueue.shift()();
        assert.equal(calls.applyThemeFromStorage, 2);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 2);
        assert.equal(calls.syncSearchUI, 2);
    } finally {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
        restoreDom();
    }
});

test("ui sync: scheduleDelayedVisualSync waits 200ms by default and skips search sync", () => {
    const restoreDom = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const scheduled = [];
    globalThis.setTimeout = (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
    };
    try {
        const { calls, input } = createUiSyncSpies();
        const controller = createUiSyncController(input);

        controller.scheduleDelayedVisualSync();

        assert.deepEqual(scheduled.map((entry) => entry.delay), [200]);
        scheduled[0].callback();
        assert.equal(calls.applyThemeFromStorage, 1);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 1);
        assert.equal(calls.syncSearchUI, 0);
    } finally {
        globalThis.setTimeout = previousSetTimeout;
        restoreDom();
    }
});

test("ui sync: visibilitychange only syncs when visible and pageshow adds delayed visual sync", () => {
    const restoreDom = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const scheduled = [];
    globalThis.setTimeout = (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
    };
    try {
        const { calls, input } = createUiSyncSpies();
        const controller = createUiSyncController(input);
        controller.setupSyncEvents();

        document.visibilityState = "hidden";
        document._events.get("visibilitychange")();
        assert.equal(calls.applyThemeFromStorage, 0);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 0);
        assert.equal(calls.syncSearchUI, 0);

        document.visibilityState = "visible";
        document._events.get("visibilitychange")();
        assert.equal(calls.applyThemeFromStorage, 1);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 1);
        assert.equal(calls.syncSearchUI, 1);

        window._events.get("pageshow")();
        assert.equal(calls.applyThemeFromStorage, 2);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 2);
        assert.equal(calls.syncSearchUI, 2);
        assert.deepEqual(scheduled.map((entry) => entry.delay), [200]);

        scheduled[0].callback();
        assert.equal(calls.applyThemeFromStorage, 3);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 3);
        assert.equal(calls.syncSearchUI, 2);
    } finally {
        globalThis.setTimeout = previousSetTimeout;
        restoreDom();
    }
});
