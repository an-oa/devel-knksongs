import test from "node:test";
import assert from "node:assert/strict";
import { createYoutubeController } from "../app/controllers/youtube.mjs";
import { applyThemeFromStorage } from "../app/ui/core/elements.mjs";
import { installFakeDom } from "./test-helpers.mjs";

function createFakeLocalStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
}

/**
 * YouTube 設定系テスト用の UI 状態を作る。
 * @param {*} input
 * @returns {*}
 */
function createYoutubeUiState(input) {
    return {
        el: {
            thumbToggle: input.thumbToggle ?? null
        },
        search: {
            dataReady: input.dataReady ?? false
        },
        playback: {
            showThumbnails: input.showThumbnails ?? true,
            activeThumb: null,
            scrollObserver: null
        }
    };
}

test("applyThemeFromStorage: main branch theme key restores dark mode state", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const ui = {
            el: {
                themeToggle: document.createElement("input")
            }
        };
        globalThis.localStorage.setItem("theme", "dark");

        applyThemeFromStorage({ ui });

        assert.equal(document.documentElement.classList.contains("dark-theme"), true);
        assert.equal(ui.el.themeToggle.checked, true);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupThumbnailToggle: main branch showThumbnails=false hides thumbnails on boot", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "false");
        const ui = createYoutubeUiState({
            thumbToggle: document.createElement("input"),
            showThumbnails: true
        });
        const controller = createYoutubeController({
            ui,
            youtube: {
                apiPromise: null,
                players: new WeakMap()
            },
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });

        controller.setupThumbnailToggle();

        assert.equal(ui.playback.showThumbnails, false);
        assert.equal(ui.el.thumbToggle.checked, false);
        assert.equal(document.body.classList.contains("hide-thumbs"), true);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("applyThumbnailFromStorage: main branch showThumbnails=true is reapplied during ui sync", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "true");
        const ui = createYoutubeUiState({
            thumbToggle: document.createElement("input"),
            showThumbnails: false,
            dataReady: true
        });
        const controller = createYoutubeController({
            ui,
            youtube: {
                apiPromise: null,
                players: new WeakMap()
            },
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });
        let displayUpdateCount = 0;
        controller.setDisplayHook(() => {
            displayUpdateCount += 1;
        });

        controller.applyThumbnailFromStorage();

        assert.equal(ui.playback.showThumbnails, true);
        assert.equal(ui.el.thumbToggle.checked, true);
        assert.equal(document.body.classList.contains("hide-thumbs"), false);
        assert.equal(displayUpdateCount, 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});
