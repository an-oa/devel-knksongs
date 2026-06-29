import test from "node:test";
import assert from "node:assert/strict";
import {
    DEFAULT_PLAYBACK_START_TIMEOUT_MS,
    createYoutubePlaybackStartResult,
    YOUTUBE_PLAYBACK_START_STATUS,
    createYoutubePlaybackStartAttemptManager
} from "../_build/app/lib/youtube/playback-start-attempt.mjs";
import { createYoutubeUnconfirmedPlaybackStartManager } from "../_build/app/lib/youtube/unconfirmed-playback-start.mjs";
import { installFakeDom, setGlobalValue } from "./test-helpers.mjs";

/**
 * 再生開始待ち manager のテスト用状態を作る。
 * @param {{ isCurrentSession?: boolean, timeoutMs?: number, setupTimeoutMs?: number } | undefined} options
 * @returns {*}
 */
function createAttemptHarness(options = {}) {
    const sharedPlayback = {
        playbackStartAttempt: null,
        unconfirmedPlaybackStartSessionId: 0
    };
    const thumb = document.createElement("div");
    thumb.dataset.playbackSessionId = "1";
    const failures = [];
    const unconfirmedStarts = createYoutubeUnconfirmedPlaybackStartManager({
        getSharedPlaybackState: () => sharedPlayback
    });
    const manager = createYoutubePlaybackStartAttemptManager({
        getSharedPlaybackState: () => sharedPlayback,
        getThumbForSession: () => thumb,
        getSessionIdForThumb: (target) => Number.parseInt(target.dataset.playbackSessionId || "", 10),
        isCurrentSession: () => options.isCurrentSession ?? true,
        handleStartFailure: (target, details) => {
            failures.push({ target, details });
        },
        markUnconfirmedStart: (sessionId) => unconfirmedStarts.mark(sessionId),
        clearUnconfirmedStart: (sessionId) => unconfirmedStarts.clear(sessionId),
        timeoutMs: options.timeoutMs ?? 10,
        setupTimeoutMs: options.setupTimeoutMs ?? 10
    });
    return { failures, manager, sharedPlayback, thumb, unconfirmedStarts };
}

/**
 * 再生開始結果の期待値を返す。
 * @param {string} status
 * @returns {{ status: string }}
 */
function playbackStartResult(status) {
    return createYoutubePlaybackStartResult(status);
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
        assert.equal(manager.settle(1, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.STARTED)), true);
        assert.equal(sharedPlayback.playbackStartAttempt, null);
        assert.equal(clearCalls.length, 1);
        assert.deepEqual(await attemptPromise, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.STARTED));
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube playback start attempt: setup timeout resolves failed result and reports start failure", async () => {
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
        assert.deepEqual(await attemptPromise, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED));
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

test("youtube playback start attempt: armStartTimeout switches from setup wait to unconfirmed start wait", async () => {
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
        const { failures, manager, sharedPlayback, thumb } = createAttemptHarness({
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

        assert.deepEqual(await attemptPromise, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.UNCONFIRMED));
        assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 1);
        assert.equal(manager.cancelForThumb(thumb), true);
        assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 0);
        assert.equal(failures.length, 0);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube playback start attempt: debug fallback treats delayed autoplay start as failed", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const timeoutCalls = [];
    setGlobalValue("setTimeout", (callback, delay) => {
        const timeoutId = { delay };
        timeoutCalls.push({ callback, delay, timeoutId });
        return timeoutId;
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        window.__KNK_AUTOPLAY_START_FALLBACK__ = true;
        const { failures, manager, sharedPlayback, thumb } = createAttemptHarness({
            timeoutMs: 10,
            setupTimeoutMs: 50
        });
        const attemptPromise = manager.create(1, { thumbDiv: thumb, playbackMode: "autoplay" });

        assert.equal(manager.armStartTimeout(1), true);
        timeoutCalls[1].callback();

        assert.deepEqual(await attemptPromise, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED));
        assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 0);
        assert.equal(failures.length, 1);
        assert.equal(failures[0].target, thumb);
        assert.deepEqual(failures[0].details, {
            playbackMode: "autoplay",
            reason: "debug-autoplay-start-fallback",
            wasPlaybackStartUnconfirmed: true
        });
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube playback start attempt: default start timeout is five seconds", () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const timeoutCalls = [];
    setGlobalValue("setTimeout", (_callback, delay) => {
        const timeoutId = { delay };
        timeoutCalls.push({ delay, timeoutId });
        return timeoutId;
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        const sharedPlayback = {
            playbackStartAttempt: null,
            unconfirmedPlaybackStartSessionId: 0
        };
        const thumb = document.createElement("div");
        const unconfirmedStarts = createYoutubeUnconfirmedPlaybackStartManager({
            getSharedPlaybackState: () => sharedPlayback
        });
        const manager = createYoutubePlaybackStartAttemptManager({
            getSharedPlaybackState: () => sharedPlayback,
            getThumbForSession: () => thumb,
            getSessionIdForThumb: () => 1,
            isCurrentSession: () => true,
            handleStartFailure: () => {},
            markUnconfirmedStart: (sessionId) => unconfirmedStarts.mark(sessionId),
            clearUnconfirmedStart: (sessionId) => unconfirmedStarts.clear(sessionId),
            setupTimeoutMs: 10
        });

        manager.create(1, { thumbDiv: thumb, playbackMode: "autoplay" });
        manager.armStartTimeout(1);

        assert.equal(timeoutCalls[1].delay, DEFAULT_PLAYBACK_START_TIMEOUT_MS);
        assert.equal(DEFAULT_PLAYBACK_START_TIMEOUT_MS, 5000);
        manager.settle(1, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED));
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

        assert.equal(manager.settle(2, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.STARTED)), false);
        assert.equal(sharedPlayback.playbackStartAttempt.sessionId, 1);
        assert.equal(manager.settle(1, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED)), true);
        assert.deepEqual(await attemptPromise, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED));
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube playback start attempt: cancelForThumb resolves the thumb session as failed result", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    setGlobalValue("setTimeout", () => ({ unref() {} }));
    setGlobalValue("clearTimeout", () => {});
    try {
        const { manager, thumb } = createAttemptHarness();
        const attemptPromise = manager.create(1, { thumbDiv: thumb });

        assert.equal(manager.cancelForThumb(thumb), true);
        assert.deepEqual(await attemptPromise, playbackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED));
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});
