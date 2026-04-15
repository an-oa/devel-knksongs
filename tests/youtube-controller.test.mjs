import test from "node:test";
import assert from "node:assert/strict";
import { createYoutubeController, extractYoutubeInfo } from "../app/controllers/youtube.mjs";
import {
    installFakeDom,
    invokeListener,
    setGlobalValue
} from "./test-helpers.mjs";

/**
 * youtube 系テスト用の UI 状態を作る。
 * @param {*} input
 * @returns {*}
 */
function createYoutubeUiState(input) {
    return {
        el: {},
        search: {
            dataReady: input.dataReady ?? false
        },
        playback: {
            showThumbnails: input.showThumbnails ?? true,
            activeThumb: input.activeThumb ?? null,
            scrollObserver: null
        }
    };
}

test("youtube: disconnected active thumb is cleared without restore work", () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({
            activeThumb: document.createElement("div")
        });
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });

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

test("youtube: vertical videos stay landscape in thumbnail mode and switch on playback", () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });
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
        assert.ok(thumb.querySelector(".youtube-player-host"));
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

test("youtube: player init uses YT.Player with playerVars instead of prebuilt iframe src", async () => {
    const cleanup = installFakeDom();
    try {
        const ui = createYoutubeUiState({});
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });
        const playerCalls = [];
        window.YT = {
            PlayerState: {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2
            },
            Player: class {
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
            }
        };

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 45 });

        thumb.onclick();
        await Promise.resolve();

        assert.equal(playerCalls.length, 1);
        assert.equal(playerCalls[0].host.tagName, "DIV");
        assert.equal(playerCalls[0].host.classList.contains("youtube-player-host"), true);
        assert.equal(playerCalls[0].options.videoId, "video1");
        assert.deepEqual(playerCalls[0].options.playerVars, {
            autoplay: 1,
            playsinline: 1,
            start: 45,
            enablejsapi: 1,
            rel: 0,
            cc_load_policy: 0,
            iv_load_policy: 3,
            origin: "https://example.test"
        });
        const iframe = thumb.querySelector("iframe");
        assert.ok(iframe);
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
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });
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
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });
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
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });

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
