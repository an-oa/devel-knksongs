import test from "node:test";
import assert from "node:assert/strict";
import { extractYoutubeInfo } from "../app/controllers/youtube.mjs";
import {
    createYoutubePlaybackStartResult,
    YOUTUBE_PLAYBACK_START_STATUS
} from "../app/lib/youtube/playback-start-attempt.mjs";
import {
    installFakeDom,
    invokeListener,
    setGlobalValue
} from "./test-helpers.mjs";
import {
    attachMockPlayerIframe,
    createFakeLocalStorage,
    createYoutubeControllerHarness,
    createYoutubeUiState,
    installYoutubePlayerConstructor
} from "./youtube-harness.mjs";

/**
 * Promise microtask queue を指定回数だけ進める。
 * @param {number} count
 */
async function flushMicrotasks(count = 1) {
    for (let index = 0; index < count; index += 1) {
        await Promise.resolve();
    }
}

/**
 * YouTube プレイヤー接続 Promise が解決し、開始タイムアウトが arm されるまで待つ。
 */
async function flushYoutubePlaybackSetup() {
    await flushMicrotasks(7);
}

/**
 * 再生開始結果の期待値を返す。
 * @param {string} status
 * @returns {{ status: string }}
 */
function playbackStartResult(status) {
    return createYoutubePlaybackStartResult(status);
}

/**
 * 再生開始結果の status を検証する。
 * @param {*} actual
 * @param {string} status
 */
function assertPlaybackStartStatus(actual, status) {
    assert.deepEqual(actual, playbackStartResult(status));
}

test("youtube: disconnected active thumb is cleared without restore work", () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            activeThumb: document.createElement("div")
        });
        const { controller } = createYoutubeControllerHarness({ ui });

        controller.restoreActivePlayback();
        assert.equal(ui.playback.activeThumb, null);
    } finally {
        cleanup();
    }
});

test("youtube: shorts url is treated as vertical playback target", () => {
    const yt = extractYoutubeInfo("https://www.youtube.com/shorts/abc123?t=45");
    assert.deepEqual(yt, { videoId: "abc123", startSeconds: 45, isVertical: true });
});

test("youtube: vertical videos stay landscape in thumbnail mode and switch on iframe playback", () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        let layoutRefreshCount = 0;
        controller.setLayoutHook(() => {
            layoutRefreshCount += 1;
        });

        const card = document.createElement("div");
        card.className = "song-card";
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "short1", startSeconds: 0, isVertical: true });
        assert.equal(thumb.dataset.videoOrientation, "landscape");
        assert.equal(card.classList.contains("song-card-expanded"), false);

        assert.equal(typeof thumb.onclick, "function");
        thumb.onclick();
        assert.match(thumb.querySelector("iframe").src, /^https:\/\/www\.youtube\.com\/embed\/short1\?/);
        assert.equal(thumb.dataset.videoOrientation, "vertical");
        assert.equal(card.classList.contains("song-card-expanded"), true);
        assert.equal(layoutRefreshCount, 1);

        const close = thumb.querySelector("button");
        invokeListener(close, "click", {
            stopPropagation() {}
        });
        assert.equal(thumb.dataset.videoOrientation, "landscape");
        assert.equal(card.classList.contains("song-card-expanded"), false);
        assert.equal(layoutRefreshCount, 2);
    } finally {
        cleanup();
    }
});

test("youtube: player init uses prebuilt iframe src and binds YT.Player to it", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const playerCalls = [];
        installYoutubePlayerConstructor(class {
            constructor(host, options) {
                playerCalls.push({ host, options });
                const iframe = document.createElement("iframe");
                host.appendChild(iframe);
                this._iframe = iframe;
                if (options.events && typeof options.events.onReady === "function") {
                    options.events.onReady({ target: this });
                }
            }

            getIframe() {
                return this._iframe;
            }

            destroy() {}
        });

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 45 });

        thumb.onclick();
        await flushMicrotasks();

        assert.equal(playerCalls.length, 1);
        assert.equal(playerCalls[0].host.tagName, "IFRAME");
        assert.match(
            playerCalls[0].host.src,
            /^https:\/\/www\.youtube\.com\/embed\/video1\?/
        );
        assert.equal(playerCalls[0].options.videoId, undefined);
        assert.equal(playerCalls[0].options.playerVars, undefined);
        const iframe = thumb.querySelector("iframe");
        assert.ok(iframe);
        assert.match(iframe.src, /^https:\/\/www\.youtube\.com\/embed\/video1\?/);
        assert.match(iframe.src, /autoplay=1/);
        assert.match(iframe.src, /start=45/);
        assert.match(iframe.src, /enablejsapi=1/);
        assert.equal(iframe.allow, "autoplay; encrypted-media");
        assert.equal(iframe.referrerPolicy, "strict-origin-when-cross-origin");
        assert.equal(iframe.allowFullscreen, true);
    } finally {
        cleanup();
    }
});

test("youtube: manual playback reveals a clipped card below the sticky header", () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const header = document.createElement("div");
        header.className = "header";
        header._rect = { top: 0, bottom: 60, left: 0, right: 300, width: 300, height: 60 };
        document.body.appendChild(header);
        const card = document.createElement("div");
        card.className = "song-card";
        card._rect = { top: 40, bottom: 240, left: 0, right: 300, width: 300, height: 200 };
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        document.scrollingElement.scrollTop = 120;
        const scrollCalls = [];
        window.scrollTo = (options) => {
            scrollCalls.push(options);
        };

        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 45 });
        thumb.onclick();

        assert.deepEqual(scrollCalls, [{ top: 100, behavior: "smooth" }]);
    } finally {
        cleanup();
    }
});

test("youtube: stale queued layout refresh requests are ignored", () => {
    const cleanup = installFakeDom();
    const previousRaf = globalThis.requestAnimationFrame;
    const rafQueue = [];
    setGlobalValue("requestAnimationFrame", (cb) => {
        rafQueue.push(cb);
        return rafQueue.length;
    });
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        let layoutRefreshCount = 0;
        controller.setLayoutHook(() => {
            layoutRefreshCount += 1;
        });

        const card = document.createElement("div");
        card.className = "song-card";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "short1", startSeconds: 0, isVertical: true });

        thumb.onclick();
        const close = thumb.querySelector("button");
        invokeListener(close, "click", {
            stopPropagation() {}
        });

        while (rafQueue.length > 0) {
            const callback = rafQueue.shift();
            if (typeof callback === "function") callback();
        }

        assert.equal(layoutRefreshCount, 1);
    } finally {
        setGlobalValue("requestAnimationFrame", previousRaf);
        cleanup();
    }
});

test("youtube: after explicit restore, same target does not auto-resume on redraw", () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        thumb.dataset.videoId = "video1";
        thumb.dataset.playbackKey = "video1:0";
        thumb.classList.add("playing");
        thumb.appendChild(document.createElement("iframe"));
        ui.playback.activeThumb = thumb;

        controller.restoreActivePlayback();
        assert.equal(ui.playback.activeThumb, null);
        assert.equal(thumb.querySelector("iframe"), null);

        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 0 });
        assert.equal(thumb.querySelector("iframe"), null);
        assert.ok(thumb.querySelector("img"));
        assert.equal(typeof thumb.onclick, "function");
    } finally {
        cleanup();
    }
});

test("youtube: switching to another thumbnail recreates the shared player", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            stopAtEndTime: true
        });
        const { controller } = createYoutubeControllerHarness({ ui });
        const playerInstances = [];
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host) {
                    this.iframe = attachMockPlayerIframe(host);
                    this.stopCalls = 0;
                    this.destroyCalls = 0;
                    this.lastLoadArgs = null;
                    playerInstances.push(this);
                }

                getIframe() {
                    return this.iframe;
                }

                stopVideo() {
                    this.stopCalls += 1;
                }

                loadVideoById(args) {
                    this.lastLoadArgs = args;
                }

                destroy() {
                    this.destroyCalls += 1;
                }
            }
        };

        const cardA = document.createElement("div");
        const cardB = document.createElement("div");
        cardA.className = "song-card";
        cardB.className = "song-card";
        const thumbA = document.createElement("div");
        const thumbB = document.createElement("div");
        cardA.appendChild(thumbA);
        cardB.appendChild(thumbB);
        document.body.append(cardA, cardB);

        controller.updateThumbnail(thumbA, { videoId: "video1", startSeconds: 5, endSeconds: 25 });
        controller.updateThumbnail(thumbB, { videoId: "video2", startSeconds: 15, endSeconds: 45 });

        thumbA.onclick();
        await flushMicrotasks();

        const firstIframe = thumbA.querySelector("iframe");
        assert.ok(firstIframe);
        assert.equal(playerInstances.length, 1);

        thumbB.onclick();
        await flushMicrotasks();

        const secondIframe = thumbB.querySelector("iframe");
        assert.equal(thumbA.querySelector("iframe"), null);
        assert.ok(secondIframe);
        assert.notEqual(secondIframe, firstIframe);
        assert.equal(playerInstances.length, 2);
        assert.equal(playerInstances[0].stopCalls, 1);
        assert.equal(playerInstances[0].destroyCalls, 1);
        assert.equal(playerInstances[0].lastLoadArgs, null);
    } finally {
        cleanup();
    }
});

test("youtube: pending shared player init uses the latest clicked thumbnail", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            stopAtEndTime: true
        });
        const { controller } = createYoutubeControllerHarness({ ui });
        const playerCalls = [];
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                    playerCalls.push({ host, options, iframe: this.iframe });
                }

                getIframe() {
                    return this.iframe;
                }

                destroy() {}
            }
        };

        const cardA = document.createElement("div");
        const cardB = document.createElement("div");
        cardA.className = "song-card";
        cardB.className = "song-card";
        cardA.dataset.songKey = "song:a";
        cardB.dataset.songKey = "song:b";
        const thumbA = document.createElement("div");
        const thumbB = document.createElement("div");
        cardA.appendChild(thumbA);
        cardB.appendChild(thumbB);
        document.body.append(cardA, cardB);

        controller.updateThumbnail(thumbA, { videoId: "video-a", startSeconds: 5, endSeconds: 25 });
        controller.updateThumbnail(thumbB, { videoId: "video-b", startSeconds: 15, endSeconds: 45 });

        thumbA.onclick();
        thumbB.onclick();
        await flushMicrotasks();

        assert.equal(playerCalls.length, 1);
        assert.equal(playerCalls[0].host.tagName, "IFRAME");
        assert.match(playerCalls[0].host.src, /^https:\/\/www\.youtube\.com\/embed\/video-b\?/);
        assert.equal(thumbA.querySelector("iframe"), null);
        assert.ok(thumbB.querySelector("iframe"));
    } finally {
        cleanup();
    }
});

test("youtube: same thumbnail recreates a fresh player after restore", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            stopAtEndTime: true
        });
        const { controller } = createYoutubeControllerHarness({ ui });
        const playerInstances = [];
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host) {
                    this.iframe = attachMockPlayerIframe(host);
                    this.stopCalls = 0;
                    this.lastLoadArgs = null;
                    playerInstances.push(this);
                }

                getIframe() {
                    return this.iframe;
                }

                stopVideo() {
                    this.stopCalls += 1;
                }

                loadVideoById(args) {
                    this.lastLoadArgs = args;
                }

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        document.body.append(card);

        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 5, endSeconds: 25 });
        thumb.onclick();
        await flushMicrotasks();

        const firstIframe = thumb.querySelector("iframe");
        assert.ok(firstIframe);
        assert.equal(playerInstances.length, 1);

        const close = thumb.querySelector("button");
        invokeListener(close, "click", {
            stopPropagation() {}
        });

        assert.equal(playerInstances[0].stopCalls, 1);
        assert.ok(thumb.querySelector("img"));

        thumb.onclick();
        await flushMicrotasks();

        const secondIframe = thumb.querySelector("iframe");
        assert.notEqual(secondIframe, firstIframe);
        assert.equal(playerInstances.length, 2);
        assert.equal(playerInstances[0].lastLoadArgs, null);
    } finally {
        cleanup();
    }
});

test("youtube: stale ended event from a previous same-thumb playback does not tear down the replay", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            stopAtEndTime: true
        });
        const { controller } = createYoutubeControllerHarness({ ui });
        let playerInstance = null;
        let stateChangeHandler = null;
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                    this.currentState = -1;
                    stateChangeHandler = options.events.onStateChange;
                    playerInstance = this;
                }

                getIframe() {
                    return this.iframe;
                }

                getPlayerState() {
                    return this.currentState;
                }

                stopVideo() {}

                loadVideoById() {
                    this.currentState = -1;
                }

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:same";
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        document.body.append(card);

        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 5, endSeconds: 25 });
        thumb.onclick();
        await flushMicrotasks();

        playerInstance.currentState = window.YT.PlayerState.PLAYING;
        stateChangeHandler({
            data: window.YT.PlayerState.PLAYING,
            target: playerInstance
        });

        const close = thumb.querySelector("button");
        invokeListener(close, "click", {
            stopPropagation() {}
        });
        await flushMicrotasks();

        const replayPromise = controller.playThumbnail(thumb, {
            videoId: "video1",
            startSeconds: 5,
            endSeconds: 25
        });
        await flushMicrotasks();

        playerInstance.currentState = window.YT.PlayerState.PLAYING;
        stateChangeHandler({
            data: window.YT.PlayerState.ENDED,
            target: playerInstance
        });
        await flushMicrotasks();

        assert.ok(thumb.querySelector("iframe"));
        assert.equal(ui.playback.activeThumb, thumb);

        stateChangeHandler({
            data: window.YT.PlayerState.PLAYING,
            target: playerInstance
        });

        assertPlaybackStartStatus(await replayPromise, YOUTUBE_PLAYBACK_START_STATUS.STARTED);
        assert.ok(thumb.querySelector("iframe"));
        assert.equal(ui.playback.activeThumb, thumb);
    } finally {
        cleanup();
    }
});

test("youtube: replay ignores ended event while the next same-thumb start is still pending", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            stopAtEndTime: true
        });
        const { controller } = createYoutubeControllerHarness({ ui });
        let playerInstance = null;
        let stateChangeHandler = null;
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                    this.currentState = -1;
                    stateChangeHandler = options.events.onStateChange;
                    playerInstance = this;
                }

                getIframe() {
                    return this.iframe;
                }

                getPlayerState() {
                    return this.currentState;
                }

                stopVideo() {}

                loadVideoById() {
                    this.currentState = window.YT.PlayerState.ENDED;
                }

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:pending";
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        document.body.append(card);

        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 5, endSeconds: 25 });
        thumb.onclick();
        await flushMicrotasks();

        playerInstance.currentState = window.YT.PlayerState.PLAYING;
        stateChangeHandler({
            data: window.YT.PlayerState.PLAYING,
            target: playerInstance
        });

        const close = thumb.querySelector("button");
        invokeListener(close, "click", {
            stopPropagation() {}
        });
        await flushMicrotasks();

        const replayPromise = controller.playThumbnail(thumb, {
            videoId: "video1",
            startSeconds: 5,
            endSeconds: 25
        });
        await flushMicrotasks();

        stateChangeHandler({
            data: window.YT.PlayerState.ENDED,
            target: playerInstance
        });
        await flushMicrotasks();

        assert.ok(thumb.querySelector("iframe"));
        assert.equal(ui.playback.activeThumb, thumb);

        playerInstance.currentState = window.YT.PlayerState.PLAYING;
        stateChangeHandler({
            data: window.YT.PlayerState.PLAYING,
            target: playerInstance
        });

        assertPlaybackStartStatus(await replayPromise, YOUTUBE_PLAYBACK_START_STATUS.STARTED);
        assert.ok(thumb.querySelector("iframe"));
        assert.equal(ui.playback.activeThumb, thumb);
    } finally {
        cleanup();
    }
});

test("youtube: playback start timeout leaves the iframe mounted as unconfirmed", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const timeoutCalls = [];
    setGlobalValue("setTimeout", (cb, delay) => {
        timeoutCalls.push({ cb, delay });
        return 1;
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host) {
                    this.iframe = attachMockPlayerIframe(host);
                }

                getIframe() {
                    return this.iframe;
                }

                destroy() {}
            }
        };

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, {
            videoId: "video-timeout",
            startSeconds: 0
        });
        await flushYoutubePlaybackSetup();

        assert.ok(thumb.querySelector("iframe"));
        const startTimeout = timeoutCalls.find((call) => call.delay === 5000);
        assert.equal(typeof startTimeout?.cb, "function");

        startTimeout.cb();
        await flushMicrotasks();

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.UNCONFIRMED);
        assert.ok(thumb.querySelector("iframe"));
        assert.equal(thumb.querySelector("img"), null);
        assert.equal(ui.playback.activeThumb, thumb);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube: autoplay timeout leaves the iframe mounted as unconfirmed", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const timeoutCalls = [];
    setGlobalValue("setTimeout", (cb, delay) => {
        timeoutCalls.push({ cb, delay });
        return {
            unref() {}
        };
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host) {
                    this.iframe = attachMockPlayerIframe(host);
                }

                getIframe() {
                    return this.iframe;
                }

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, {
            videoId: "video-auto-timeout",
            startSeconds: 0
        }, {
            playbackMode: "autoplay"
        });
        await flushYoutubePlaybackSetup();

        const startTimeout = timeoutCalls.find((call) => call.delay === 5000);
        assert.equal(typeof startTimeout?.cb, "function");

        startTimeout.cb();
        await flushMicrotasks();

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.UNCONFIRMED);
        assert.ok(thumb.querySelector("iframe"));
        assert.equal(thumb.querySelector("img"), null);
        assert.equal(ui.playback.activeThumb, thumb);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube: debug autoplay fallback restores thumbnail and notifies continuation", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const timeoutCalls = [];
    setGlobalValue("setTimeout", (cb, delay) => {
        timeoutCalls.push({ cb, delay });
        return {
            unref() {}
        };
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        window.__KNK_AUTOPLAY_START_FALLBACK__ = true;
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const failedCalls = [];
        controller.setPlaybackStartFailedHook((payload) => {
            failedCalls.push(payload);
        });
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host) {
                    this.iframe = attachMockPlayerIframe(host);
                }

                getIframe() {
                    return this.iframe;
                }

                stopVideo() {}

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:debug-autoplay-fallback";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, {
            videoId: "video-debug-autoplay-fallback",
            startSeconds: 0
        }, {
            playbackMode: "autoplay"
        });
        await flushYoutubePlaybackSetup();

        const startTimeout = timeoutCalls.find((call) => call.delay === 5000);
        assert.equal(typeof startTimeout?.cb, "function");
        startTimeout.cb();
        await flushMicrotasks(2);

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.FAILED);
        assert.ok(thumb.querySelector("img"));
        assert.equal(thumb.querySelector("iframe"), null);
        assert.equal(ui.playback.activeThumb, null);
        assert.deepEqual(failedCalls, [
            {
                songKey: "song:debug-autoplay-fallback",
                playbackMode: "autoplay",
                wasPlaybackStartUnconfirmed: true
            }
        ]);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube: delayed autoplay error after unconfirmed timeout notifies continuation", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const timeoutCalls = [];
    setGlobalValue("setTimeout", (cb, delay) => {
        timeoutCalls.push({ cb, delay });
        return {
            unref() {}
        };
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const failedCalls = [];
        let errorHandler = null;
        controller.setPlaybackStartFailedHook((payload) => {
            failedCalls.push(payload);
        });
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host);
                    errorHandler = options.events.onError;
                }

                getIframe() {
                    return this.iframe;
                }

                stopVideo() {}

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:delayed-autoplay-error";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, {
            videoId: "video-delayed-autoplay-error",
            startSeconds: 0
        }, {
            playbackMode: "autoplay"
        });
        await flushYoutubePlaybackSetup();

        const startTimeout = timeoutCalls.find((call) => call.delay === 5000);
        assert.equal(typeof startTimeout?.cb, "function");
        startTimeout.cb();
        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.UNCONFIRMED);

        errorHandler({ data: 150 });
        await flushMicrotasks(2);

        assert.ok(thumb.querySelector("img"));
        assert.equal(ui.playback.activeThumb, null);
        assert.deepEqual(failedCalls, [
            {
                songKey: "song:delayed-autoplay-error",
                playbackMode: "autoplay",
                wasPlaybackStartUnconfirmed: true
            }
        ]);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube: iframe playback stays mounted when iframe api loading fails", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    let timeoutCallback = null;
    setGlobalValue("setTimeout", (cb) => {
        timeoutCallback = cb;
        return {
            unref() {}
        };
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        const ui = createYoutubeUiState({});
        const { youtube, controller } = createYoutubeControllerHarness({ ui });

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, {
            videoId: "video-fallback",
            startSeconds: 12
        });
        await flushMicrotasks();

        const apiScript = document.head.children[0];
        assert.equal(apiScript.tagName, "SCRIPT");
        assert.equal(typeof apiScript.onerror, "function");
        apiScript.onerror();
        await youtube.apiPromise.catch(() => {});
        await flushMicrotasks();

        assert.ok(thumb.querySelector("iframe"));
        assert.equal(typeof timeoutCallback, "function");

        timeoutCallback();
        await flushMicrotasks();

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.STARTED);
        assert.ok(thumb.querySelector("iframe"));
        assert.equal(thumb.querySelector("img"), null);
        assert.equal(ui.playback.activeThumb, thumb);
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube: autoplay playback is restored when iframe api loading fails", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    let timeoutCallback = null;
    setGlobalValue("setTimeout", (cb) => {
        timeoutCallback = cb;
        return {
            unref() {}
        };
    });
    setGlobalValue("clearTimeout", () => {});
    try {
        const ui = createYoutubeUiState({});
        const { youtube, controller } = createYoutubeControllerHarness({ ui });

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        thumb.dataset.videoId = "video-fallback-autoplay";
        const playbackPromise = controller.playThumbnail(thumb, {
            videoId: "video-fallback-autoplay",
            startSeconds: 12
        }, {
            playbackMode: "autoplay"
        });
        await flushMicrotasks();

        const apiScript = document.head.children[0];
        assert.equal(apiScript.tagName, "SCRIPT");
        assert.equal(typeof apiScript.onerror, "function");
        apiScript.onerror();
        await youtube.apiPromise.catch(() => {});
        await flushMicrotasks();

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.FAILED);
        assert.ok(thumb.querySelector("img"));
        assert.equal(thumb.querySelector("iframe"), null);
        assert.equal(ui.playback.activeThumb, null);
        assert.equal(typeof timeoutCallback, "function");
    } finally {
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube: embed url includes end time when stopAtEndTime is enabled", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            stopAtEndTime: true
        });
        const { controller } = createYoutubeControllerHarness({ ui });
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                }

                getIframe() {
                    return this.iframe;
                }

                destroy() {}
            }
        };

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 45, endSeconds: 75 });
        thumb.onclick();
        await flushMicrotasks();

        assert.match(thumb.querySelector("iframe").src, /^https:\/\/www\.youtube\.com\/embed\/video1\?/);
        assert.match(thumb.querySelector("iframe").src, /start=45/);
        assert.match(thumb.querySelector("iframe").src, /end=75/);
        assert.equal(thumb.dataset.playbackKey, "video1:45:75");
    } finally {
        cleanup();
    }
});

test("youtube: embed url omits end time when stopAtEndTime is disabled", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            stopAtEndTime: false
        });
        const { controller } = createYoutubeControllerHarness({ ui });
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                }

                getIframe() {
                    return this.iframe;
                }

                destroy() {}
            }
        };

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 45, endSeconds: 75 });
        thumb.onclick();
        await flushMicrotasks();

        assert.match(thumb.querySelector("iframe").src, /^https:\/\/www\.youtube\.com\/embed\/video1\?/);
        assert.match(thumb.querySelector("iframe").src, /start=45/);
        assert.equal(/(?:\?|&)end=/.test(thumb.querySelector("iframe").src), false);
        assert.equal(thumb.dataset.playbackKey, "video1:45:");
    } finally {
        cleanup();
    }
});

test("youtube: ended playback restores thumbnail while paused playback keeps iframe", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });

        let playerInstance = null;
        let stateChangeHandler = null;
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                    this.stopCallCount = 0;
                    stateChangeHandler = options.events.onStateChange;
                    playerInstance = this;
                }

                getIframe() {
                    return this.iframe;
                }

                stopVideo() {
                    this.stopCallCount += 1;
                }

                destroy() {}
            }
        };

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 45 });
        thumb.onclick();
        await flushMicrotasks();

        assert.ok(thumb.querySelector("iframe"));
        assert.equal(thumb.classList.contains("playing"), true);
        assert.equal(typeof stateChangeHandler, "function");

        stateChangeHandler({ data: globalThis.window.YT.PlayerState.PAUSED });
        assert.ok(thumb.querySelector("iframe"));
        assert.equal(thumb.classList.contains("playing"), false);

        thumb.classList.add("playing");
        stateChangeHandler({ data: globalThis.window.YT.PlayerState.ENDED });
        await flushMicrotasks();
        assert.equal(thumb.querySelector("iframe"), null);
        assert.ok(thumb.querySelector("img"));
        assert.equal(thumb.classList.contains("playing"), false);
        assert.equal(ui.playback.activeThumb, null);
        assert.equal(playerInstance.stopCallCount, 1);
    } finally {
        cleanup();
    }
});

test("youtube: ended playback notifies song key for playback continuation", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        let endedSongKey = "";
        let stateChangeHandler = null;
        controller.setPlaybackEndedHook(({ songKey }) => {
            endedSongKey = songKey;
        });
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(_, options) {
                    stateChangeHandler = options.events.onStateChange;
                }

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:2";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "video2", startSeconds: 0 });
        thumb.onclick();
        await flushMicrotasks();

        stateChangeHandler({ data: globalThis.window.YT.PlayerState.PLAYING });
        stateChangeHandler({ data: globalThis.window.YT.PlayerState.ENDED });
        await flushMicrotasks();

        assert.equal(endedSongKey, "song:2");
        assert.equal(ui.playback.activeThumb, null);
        assert.ok(thumb.querySelector("img"));
    } finally {
        cleanup();
    }
});

test("youtube: stale ended event from a closed player does not notify playback continuation", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const endedCalls = [];
        const failedCalls = [];
        let stateChangeHandler = null;
        controller.setPlaybackEndedHook(({ songKey }) => {
            endedCalls.push(songKey);
        });
        controller.setPlaybackStartFailedHook((payload) => {
            failedCalls.push(payload);
        });
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(_, options) {
                    stateChangeHandler = options.events.onStateChange;
                }

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:stale";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "video-stale", startSeconds: 0 });
        thumb.onclick();
        await flushMicrotasks();

        const close = thumb.querySelector("button");
        invokeListener(close, "click", {
            stopPropagation() {}
        });
        await flushMicrotasks();

        stateChangeHandler({ data: globalThis.window.YT.PlayerState.ENDED });
        await flushMicrotasks();

        assert.deepEqual(endedCalls, []);
        assert.equal(ui.playback.activeThumb, null);
    } finally {
        cleanup();
    }
});

test("youtube: ended playback waits for layout refresh before notifying", async () => {
    const cleanup = installFakeDom();
    const previousRaf = globalThis.requestAnimationFrame;
    const rafQueue = [];
    setGlobalValue("requestAnimationFrame", (cb) => {
        rafQueue.push(cb);
        return rafQueue.length;
    });
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const order = [];
        let stateChangeHandler = null;
        controller.setLayoutHook(() => {
            order.push("layout");
        });
        controller.setPlaybackEndedHook(({ songKey }) => {
            order.push(`ended:${songKey}`);
        });
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(_, options) {
                    stateChangeHandler = options.events.onStateChange;
                }

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:wait";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        controller.playThumbnail(thumb, { videoId: "video-wait", startSeconds: 0 });
        await flushMicrotasks();

        stateChangeHandler({ data: globalThis.window.YT.PlayerState.PLAYING });
        stateChangeHandler({ data: globalThis.window.YT.PlayerState.ENDED });
        assert.deepEqual(order, []);

        const firstFrame = rafQueue.shift();
        firstFrame();
        assert.deepEqual(order, ["layout"]);

        const secondFrame = rafQueue.shift();
        secondFrame();
        await flushMicrotasks();

        assert.deepEqual(order, ["layout", "ended:song:wait"]);
    } finally {
        setGlobalValue("requestAnimationFrame", previousRaf);
        cleanup();
    }
});

test("youtube: ended playback does not continue after a newer playback starts", async () => {
    const cleanup = installFakeDom();
    const previousRaf = globalThis.requestAnimationFrame;
    const rafQueue = [];
    setGlobalValue("requestAnimationFrame", (cb) => {
        rafQueue.push(cb);
        return rafQueue.length;
    });
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const endedCalls = [];
        const stateChangeHandlers = [];
        controller.setPlaybackEndedHook(({ songKey }) => {
            endedCalls.push(songKey);
        });
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(_, options) {
                    stateChangeHandlers.push(options.events.onStateChange);
                }

                destroy() {}
            }
        };

        const firstCard = document.createElement("div");
        firstCard.className = "song-card";
        firstCard.dataset.songKey = "song:first";
        document.body.appendChild(firstCard);
        const firstThumb = document.createElement("div");
        firstCard.appendChild(firstThumb);
        controller.updateThumbnail(firstThumb, { videoId: "video-first", startSeconds: 0 });
        firstThumb.onclick();
        await flushMicrotasks();
        stateChangeHandlers[0]({ data: globalThis.window.YT.PlayerState.PLAYING });

        const secondCard = document.createElement("div");
        secondCard.className = "song-card";
        secondCard.dataset.songKey = "song:second";
        document.body.appendChild(secondCard);
        const secondThumb = document.createElement("div");
        secondCard.appendChild(secondThumb);

        stateChangeHandlers[0]({ data: globalThis.window.YT.PlayerState.ENDED });
        controller.playThumbnail(secondThumb, { videoId: "video-second", startSeconds: 0 });
        await flushMicrotasks();

        while (rafQueue.length > 0) {
            const callback = rafQueue.shift();
            if (typeof callback === "function") callback();
        }
        await flushMicrotasks();

        assert.deepEqual(endedCalls, []);
        assert.equal(ui.playback.activeThumb, secondThumb);
    } finally {
        setGlobalValue("requestAnimationFrame", previousRaf);
        cleanup();
    }
});

test("youtube: ended before playback starts restores thumbnail without notifying continuation", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const endedCalls = [];
        const failedCalls = [];
        let stateChangeHandler = null;
        controller.setPlaybackEndedHook(({ songKey }) => {
            endedCalls.push(songKey);
        });
        controller.setPlaybackStartFailedHook((payload) => {
            failedCalls.push(payload);
        });
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(_, options) {
                    stateChangeHandler = options.events.onStateChange;
                }

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:instant-end";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, { videoId: "video-instant-end", startSeconds: 0 });
        await flushMicrotasks();

        stateChangeHandler({ data: globalThis.window.YT.PlayerState.ENDED });
        await flushMicrotasks();

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.FAILED);
        assert.deepEqual(endedCalls, []);
        assert.deepEqual(failedCalls, [
            {
                songKey: "song:instant-end",
                playbackMode: "manual"
            }
        ]);
        assert.equal(ui.playback.activeThumb, null);
        assert.ok(thumb.querySelector("img"));
    } finally {
        cleanup();
    }
});

test("youtube: playThumbnail resolves started result after the player enters PLAYING", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        let stateChangeHandler = null;
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                    stateChangeHandler = options.events.onStateChange;
                }

                getIframe() {
                    return this.iframe;
                }

                destroy() {}
            }
        };

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, { videoId: "video-play", startSeconds: 0 });
        await flushMicrotasks();

        stateChangeHandler({ data: globalThis.window.YT.PlayerState.PLAYING });

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.STARTED);
    } finally {
        cleanup();
    }
});

test("youtube: playThumbnail resolves started result when attached player is already playing", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                }

                getIframe() {
                    return this.iframe;
                }

                getPlayerState() {
                    return globalThis.window.YT.PlayerState.PLAYING;
                }

                destroy() {}
            }
        };

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, { videoId: "video-already-playing", startSeconds: 0 });
        await flushMicrotasks();

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.STARTED);
    } finally {
        cleanup();
    }
});

test("youtube: playThumbnail resolves failed result and restores the thumbnail after a player error", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const failedCalls = [];
        controller.setPlaybackStartFailedHook((payload) => {
            failedCalls.push(payload);
        });
        let errorHandler = null;
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                    errorHandler = options.events.onError;
                }

                getIframe() {
                    return this.iframe;
                }

                stopVideo() {}

                destroy() {}
            }
        };

        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:player-error";
        document.body.appendChild(card);
        const thumb = document.createElement("div");
        card.appendChild(thumb);
        thumb.dataset.videoId = "video-error";
        const playbackPromise = controller.playThumbnail(thumb, { videoId: "video-error", startSeconds: 0 });
        await flushMicrotasks();

        errorHandler({ data: 150 });

        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.FAILED);
        assert.ok(thumb.querySelector("img"));
        assert.equal(thumb.classList.contains("playing"), false);
        assert.deepEqual(failedCalls, [
            {
                songKey: "song:player-error",
                playbackMode: "manual"
            }
        ]);
    } finally {
        cleanup();
    }
});

test("youtube: autoplay timeout emits debug logs only when debug mode is enabled", async () => {
    const cleanup = installFakeDom();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const previousConsoleDebug = console.debug;
    const previousLocalStorage = globalThis.localStorage;
    let timeoutCallback = null;
    const debugCalls = [];
    setGlobalValue("setTimeout", (cb) => {
        timeoutCallback = cb;
        return {
            unref() {}
        };
    });
    setGlobalValue("clearTimeout", () => {});
    setGlobalValue("localStorage", createFakeLocalStorage());
    console.debug = (...args) => {
        debugCalls.push(args);
    };
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        const playbackPromise = controller.playThumbnail(thumb, {
            videoId: "video-autoplay-debug",
            startSeconds: 30
        }, {
            playbackMode: "autoplay"
        });
        await flushMicrotasks();

        timeoutCallback();
        await flushMicrotasks();
        assertPlaybackStartStatus(await playbackPromise, YOUTUBE_PLAYBACK_START_STATUS.FAILED);
        assert.deepEqual(debugCalls, []);

        globalThis.localStorage.setItem("debugYoutubePlayer", "true");

        const secondPlaybackPromise = controller.playThumbnail(thumb, {
            videoId: "video-autoplay-debug-2",
            startSeconds: 45
        }, {
            playbackMode: "autoplay"
        });
        await flushMicrotasks();

        timeoutCallback();
        await flushMicrotasks();
        assertPlaybackStartStatus(await secondPlaybackPromise, YOUTUBE_PLAYBACK_START_STATUS.FAILED);
        assert.equal(
            debugCalls.some((args) => JSON.stringify(args) === JSON.stringify([
                "[youtube]",
                "autoplay playback start failed; skipping candidate",
                {
                    songKey: "",
                    videoId: "video-autoplay-debug-2",
                    reason: "setup-timeout"
                }
            ])),
            true
        );
    } finally {
        console.debug = previousConsoleDebug;
        setGlobalValue("localStorage", previousLocalStorage);
        setGlobalValue("setTimeout", previousSetTimeout);
        setGlobalValue("clearTimeout", previousClearTimeout);
        cleanup();
    }
});

test("youtube: recreating the shared player does not fail the newer playback attempt early", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const { controller } = createYoutubeControllerHarness({ ui });
        const stateChangeHandlers = [];
        globalThis.window.YT = {
            PlayerState: {
                PAUSED: 2,
                ENDED: 0,
                PLAYING: 1
            },
            Player: class {
                constructor(host, options) {
                    this.iframe = attachMockPlayerIframe(host, options);
                    stateChangeHandlers.push(options.events.onStateChange);
                }

                getIframe() {
                    return this.iframe;
                }

                destroy() {}
            }
        };

        const firstCard = document.createElement("div");
        const secondCard = document.createElement("div");
        firstCard.className = "song-card";
        secondCard.className = "song-card";
        const firstThumb = document.createElement("div");
        const secondThumb = document.createElement("div");
        firstCard.appendChild(firstThumb);
        secondCard.appendChild(secondThumb);
        document.body.append(firstCard, secondCard);

        const firstPromise = controller.playThumbnail(firstThumb, { videoId: "video-first", startSeconds: 0 });
        await flushMicrotasks();

        let secondResult = "pending";
        const secondPromise = controller.playThumbnail(secondThumb, { videoId: "video-second", startSeconds: 0 });
        secondPromise.then((didStart) => {
            secondResult = didStart;
        });
        await flushMicrotasks();

        assertPlaybackStartStatus(await firstPromise, YOUTUBE_PLAYBACK_START_STATUS.FAILED);
        assert.equal(secondResult, "pending");

        stateChangeHandlers[1]({ data: globalThis.window.YT.PlayerState.PLAYING });

        assertPlaybackStartStatus(await secondPromise, YOUTUBE_PLAYBACK_START_STATUS.STARTED);
        assertPlaybackStartStatus(secondResult, YOUTUBE_PLAYBACK_START_STATUS.STARTED);
    } finally {
        cleanup();
    }
});
