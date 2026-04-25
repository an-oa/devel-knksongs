import test from "node:test";
import assert from "node:assert/strict";
import {
    createYoutubePlaybackStartAttemptManager
} from "../app/lib/youtube/playback-start-attempt.mjs";
import { installFakeDom, setGlobalValue } from "./test-helpers.mjs";

/**
 * 再生開始待ち manager のテスト用状態を作る。
 * @param {{ isCurrentSession?: boolean, timeoutMs?: number, setupTimeoutMs?: number } | undefined} options
 * @returns {*}
 */
function createAttemptHarness(options = {}) {
    const sharedPlayback = {
        playbackStartAttempt: null
    };
    const thumb = document.createElement("div");
    thumb.dataset.playbackSessionId = "1";
    const failures = [];
    const manager = createYoutubePlaybackStartAttemptManager({
        getSharedPlaybackState: () => sharedPlayback,
        getThumbForSession: () => thumb,
        getSessionIdForThumb: (target) => Number.parseInt(target.dataset.playbackSessionId || "", 10),
        isCurrentSession: () => options.isCurrentSession ?? true,
        handleStartFailure: (target, details) => {
            failures.push({ target, details });
        },
        timeoutMs: options.timeoutMs ?? 10,
        setupTimeoutMs: options.setupTimeoutMs ?? 10
    });
    return { failures, manager, sharedPlayback, thumb };
}

test("youtube playback start attempt: settle resolves current attempt and clears timeout", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const clearCalls = [];
    setGlobalValue("setTimeout", () => ({ unref() {} }));
    setGlobalValue("clearTimeout", (timeoutId) => {
        clearCalls.push(timeoutId);
    });
    try {
        const { manager, sharedPlayback, thumb } = createAttemptHarness();
        const attemptPromise = manager.create(1, { thumbDiv: thumb, playbackMode: "manual" });

        assert.equal(sharedPlayback.playbackStartAttempt.sessionId, 1);
        assert.equal(manager.settle(1, true), true);
        assert.equal(sharedPlayback.playbackStartAttempt, null);
        assert.equal(clearCalls.length, 1);
        assert.equal(await attemptPromise, true);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube playback start attempt: setup timeout resolves false and reports start failure", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    let timeoutCallback = null;
    setGlobalValue("setTimeout", (callback) => {
        timeoutCallback = callback;
        return {
            unref() {}
        };
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        const { failures, manager, sharedPlayback, thumb } = createAttemptHarness();
        const attemptPromise = manager.create(1, { thumbDiv: thumb, playbackMode: "autoplay" });

        timeoutCallback();

        assert.equal(sharedPlayback.playbackStartAttempt, null);
        assert.equal(await attemptPromise, false);
        assert.equal(failures.length, 1);
        assert.equal(failures[0].target, thumb);
        assert.deepEqual(failures[0].details, {
            playbackMode: "autoplay",
            reason: "setup-timeout"
        });
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube playback start attempt: armStartTimeout switches from setup wait to playback start wait", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const timeoutCalls = [];
    const clearCalls = [];
    setGlobalValue("setTimeout", (callback, delay) => {
        const timeoutId = { delay };
        timeoutCalls.push({ callback, delay, timeoutId });
        return timeoutId;
    });
    setGlobalValue("clearTimeout", (timeoutId) => {
        clearCalls.push(timeoutId);
    });
    try {
        const { failures, manager, thumb } = createAttemptHarness({
            timeoutMs: 10,
            setupTimeoutMs: 50
        });
        const attemptPromise = manager.create(1, { thumbDiv: thumb, playbackMode: "autoplay" });

        assert.equal(timeoutCalls.length, 1);
        assert.equal(timeoutCalls[0].delay, 50);
        assert.equal(manager.armStartTimeout(1), true);
        assert.equal(timeoutCalls.length, 2);
        assert.equal(timeoutCalls[1].delay, 10);
        assert.deepEqual(clearCalls, [timeoutCalls[0].timeoutId]);

        timeoutCalls[1].callback();

        assert.equal(await attemptPromise, false);
        assert.equal(failures.length, 1);
        assert.deepEqual(failures[0].details, {
            playbackMode: "autoplay",
            reason: "start-timeout"
        });
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube playback start attempt: stale session settle is ignored", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    setGlobalValue("setTimeout", () => ({ unref() {} }));
    setGlobalValue("clearTimeout", () => {});
    try {
        const { manager, sharedPlayback, thumb } = createAttemptHarness();
        const attemptPromise = manager.create(1, { thumbDiv: thumb });

        assert.equal(manager.settle(2, true), false);
        assert.equal(sharedPlayback.playbackStartAttempt.sessionId, 1);
        assert.equal(manager.settle(1, false), true);
        assert.equal(await attemptPromise, false);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube playback start attempt: cancelForThumb resolves the thumb session as false", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    setGlobalValue("setTimeout", () => ({ unref() {} }));
    setGlobalValue("clearTimeout", () => {});
    try {
        const { manager, thumb } = createAttemptHarness();
        const attemptPromise = manager.create(1, { thumbDiv: thumb });

        assert.equal(manager.cancelForThumb(thumb), true);
        assert.equal(await attemptPromise, false);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});
