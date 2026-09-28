import test from "node:test";
import assert from "node:assert/strict";
import { createUiSyncController } from "../app/ui/core/sync.mts";
import { installFakeDom, installFakeTimeouts, invokeListener, installFakeAnimationFrames } from "./test-helpers.mts";

/**
 * UI sync テスト用のスパイ群を作る。
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
    const frames = installFakeAnimationFrames();
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
        assert.equal(frames.pendingCount, 1);

        frames.advanceFrame();
        assert.equal(calls.applyThemeFromStorage, 2);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 2);
        assert.equal(calls.syncSearchUI, 0);

        controller.scheduleSyncUiState({ visual: false });
        assert.equal(calls.applyThemeFromStorage, 2);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 2);
        assert.equal(calls.syncSearchUI, 1);
        assert.equal(frames.pendingCount, 1);

        frames.advanceFrame();
        assert.equal(calls.applyThemeFromStorage, 2);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 2);
        assert.equal(calls.syncSearchUI, 2);
    } finally {
        frames.cleanup();
        restoreDom();
    }
});

test("ui sync: scheduleDelayedVisualSync waits 200ms by default and skips search sync", () => {
    const restoreDom = installFakeDom();
    const fakeTimeouts = installFakeTimeouts();
    const scheduled = fakeTimeouts.timeoutCalls;
    try {
        const { calls, input } = createUiSyncSpies();
        const controller = createUiSyncController(input);

        controller.scheduleDelayedVisualSync();

        assert.deepEqual(scheduled.map((entry) => entry.delay), [200]);
        scheduled[0].cb();
        assert.equal(calls.applyThemeFromStorage, 1);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 1);
        assert.equal(calls.syncSearchUI, 0);
    } finally {
        fakeTimeouts.cleanup();
        restoreDom();
    }
});

test("ui sync: visibilitychange only syncs when visible and pageshow adds delayed visual sync", () => {
    const restoreDom = installFakeDom();
    const fakeTimeouts = installFakeTimeouts();
    const scheduled = fakeTimeouts.timeoutCalls;
    try {
        const { calls, input } = createUiSyncSpies();
        const controller = createUiSyncController(input);
        controller.setupSyncEvents();

        restoreDom.document.visibilityState = "hidden";
        invokeListener(restoreDom.document, "visibilitychange", {});
        assert.equal(calls.applyThemeFromStorage, 0);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 0);
        assert.equal(calls.syncSearchUI, 0);

        restoreDom.document.visibilityState = "visible";
        invokeListener(restoreDom.document, "visibilitychange", {});
        assert.equal(calls.applyThemeFromStorage, 1);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 1);
        assert.equal(calls.syncSearchUI, 1);

        invokeListener(restoreDom.window, "pageshow", {});
        assert.equal(calls.applyThemeFromStorage, 2);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 2);
        assert.equal(calls.syncSearchUI, 2);
        assert.deepEqual(scheduled.map((entry) => entry.delay), [200]);

        scheduled[0].cb();
        assert.equal(calls.applyThemeFromStorage, 3);
        assert.equal(calls.applyPlaybackSettingsFromStorage, 3);
        assert.equal(calls.syncSearchUI, 2);
    } finally {
        fakeTimeouts.cleanup();
        restoreDom();
    }
});
