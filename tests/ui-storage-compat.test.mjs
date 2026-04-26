import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackSettingsController } from "../app/controllers/playback-settings.mjs";
import { applyThemeFromStorage } from "../app/ui/core/elements.mjs";
import { installFakeDom, invokeListener } from "./test-helpers.mjs";

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
 * 再生設定系テスト用の UI 状態を作る。
 * @param {*} input
 * @returns {*}
 */
function createPlaybackSettingsUiState(input) {
    return {
        el: {
            thumbToggle: input.thumbToggle ?? null,
            experimentalPlaybackToggleSection: input.experimentalPlaybackToggleSection ?? null,
            experimentalPlaybackToggle: input.experimentalPlaybackToggle ?? null,
            endTimeToggle: input.endTimeToggle ?? null,
            continuousPlaybackToggle: input.continuousPlaybackToggle ?? null,
            loopPlaybackToggle: input.loopPlaybackToggle ?? null,
            playbackSettingsGroup: input.playbackSettingsGroup ?? null,
            themeToggle: input.themeToggle ?? null
        },
        search: {
            dataReady: input.dataReady ?? false
        },
        playback: {
            showThumbnails: input.showThumbnails ?? true,
            showExperimentalPlaybackSettings: input.showExperimentalPlaybackSettings ?? false,
            stopAtEndTime: input.stopAtEndTime ?? false,
            continuousPlayback: input.continuousPlayback ?? false,
            loopPlayback: input.loopPlayback ?? false,
            activeThumb: input.activeThumb ?? null,
            scrollObserver: null
        }
    };
}

/**
 * 再生設定テスト用の依存関数を作る。
 * @param {*} input
 * @returns {*}
 */
function createPlaybackSettingsCallbacks(input) {
    const callbacks = input || {};
    return {
        ensureThumbnailPlaybackReady: callbacks.ensureThumbnailPlaybackReady || (() => {}),
        restoreActivePlayback: callbacks.restoreActivePlayback || (() => {}),
        updateDisplay: callbacks.updateDisplay || (() => {}),
        setupScrollObserver: callbacks.setupScrollObserver || (() => {})
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

test("setupPlaybackSettings: stored playback settings are restored on boot", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "false");
        globalThis.localStorage.setItem("showExperimentalPlaybackSettings", "true");
        globalThis.localStorage.setItem("stopAtEndTime", "true");
        globalThis.localStorage.setItem("continuousPlayback", "true");
        globalThis.localStorage.setItem("loopPlayback", "true");
        const ui = createPlaybackSettingsUiState({
            thumbToggle: document.createElement("input"),
            experimentalPlaybackToggleSection: document.createElement("div"),
            experimentalPlaybackToggle: document.createElement("input"),
            endTimeToggle: document.createElement("input"),
            continuousPlaybackToggle: document.createElement("input"),
            loopPlaybackToggle: document.createElement("input"),
            playbackSettingsGroup: document.createElement("section")
        });
        const controller = createPlaybackSettingsController({
            ui,
            callbacks: createPlaybackSettingsCallbacks()
        });

        controller.setupPlaybackSettings();

        assert.equal(ui.playback.showThumbnails, false);
        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(ui.playback.stopAtEndTime, false);
        assert.equal(ui.playback.continuousPlayback, false);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.thumbToggle.checked, false);
        assert.equal(ui.el.experimentalPlaybackToggle.checked, true);
        assert.equal(ui.el.experimentalPlaybackToggle.disabled, true);
        assert.equal(ui.el.experimentalPlaybackToggleSection.hidden, true);
        assert.equal(ui.el.experimentalPlaybackToggleSection.getAttribute("aria-hidden"), "true");
        assert.equal(ui.el.endTimeToggle.checked, false);
        assert.equal(ui.el.continuousPlaybackToggle.checked, false);
        assert.equal(ui.el.loopPlaybackToggle.checked, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");
        assert.equal(document.body.classList.contains("hide-thumbs"), true);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("applyPlaybackSettingsFromStorage: ui sync reapplies stored playback settings", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "true");
        globalThis.localStorage.setItem("showExperimentalPlaybackSettings", "false");
        globalThis.localStorage.setItem("stopAtEndTime", "true");
        globalThis.localStorage.setItem("continuousPlayback", "true");
        globalThis.localStorage.setItem("loopPlayback", "false");
        const ui = createPlaybackSettingsUiState({
            thumbToggle: document.createElement("input"),
            experimentalPlaybackToggleSection: document.createElement("div"),
            experimentalPlaybackToggle: document.createElement("input"),
            endTimeToggle: document.createElement("input"),
            continuousPlaybackToggle: document.createElement("input"),
            loopPlaybackToggle: document.createElement("input"),
            playbackSettingsGroup: document.createElement("section"),
            showThumbnails: false,
            showExperimentalPlaybackSettings: true,
            dataReady: true
        });
        const controller = createPlaybackSettingsController({
            ui,
            callbacks: createPlaybackSettingsCallbacks({
                updateDisplay: () => {
                    displayUpdateCount += 1;
                }
            })
        });
        let displayUpdateCount = 0;

        controller.applyPlaybackSettingsFromStorage();

        assert.equal(ui.playback.showThumbnails, true);
        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.playback.stopAtEndTime, false);
        assert.equal(ui.playback.continuousPlayback, false);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.thumbToggle.checked, true);
        assert.equal(ui.el.experimentalPlaybackToggle.checked, false);
        assert.equal(ui.el.experimentalPlaybackToggle.disabled, false);
        assert.equal(ui.el.experimentalPlaybackToggleSection.hidden, false);
        assert.equal(ui.el.experimentalPlaybackToggleSection.getAttribute("aria-hidden"), "false");
        assert.equal(ui.el.endTimeToggle.checked, false);
        assert.equal(ui.el.continuousPlaybackToggle.checked, false);
        assert.equal(ui.el.loopPlaybackToggle.checked, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");
        assert.equal(document.body.classList.contains("hide-thumbs"), false);
        assert.equal(displayUpdateCount, 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("applyPlaybackSettingsFromStorage: hidden experimental playback settings do not restore hidden playback behavior", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "true");
        globalThis.localStorage.setItem("showExperimentalPlaybackSettings", "false");
        globalThis.localStorage.setItem("stopAtEndTime", "true");
        globalThis.localStorage.setItem("continuousPlayback", "true");
        globalThis.localStorage.setItem("loopPlayback", "true");
        const ui = createPlaybackSettingsUiState({
            thumbToggle: document.createElement("input"),
            experimentalPlaybackToggleSection: document.createElement("div"),
            experimentalPlaybackToggle: document.createElement("input"),
            endTimeToggle: document.createElement("input"),
            continuousPlaybackToggle: document.createElement("input"),
            loopPlaybackToggle: document.createElement("input"),
            playbackSettingsGroup: document.createElement("section")
        });
        const controller = createPlaybackSettingsController({
            ui,
            callbacks: createPlaybackSettingsCallbacks()
        });

        controller.applyPlaybackSettingsFromStorage();

        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.playback.stopAtEndTime, false);
        assert.equal(ui.playback.continuousPlayback, false);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.experimentalPlaybackToggle.checked, false);
        assert.equal(ui.el.experimentalPlaybackToggle.disabled, false);
        assert.equal(ui.el.experimentalPlaybackToggleSection.hidden, false);
        assert.equal(ui.el.experimentalPlaybackToggleSection.getAttribute("aria-hidden"), "false");
        assert.equal(ui.el.endTimeToggle.checked, false);
        assert.equal(ui.el.continuousPlaybackToggle.checked, false);
        assert.equal(ui.el.loopPlaybackToggle.checked, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: end time toggle restores active playback before switching mode", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "true");
        globalThis.localStorage.setItem("showExperimentalPlaybackSettings", "true");
        globalThis.localStorage.setItem("stopAtEndTime", "true");
        const ui = createPlaybackSettingsUiState({
            thumbToggle: document.createElement("input"),
            experimentalPlaybackToggle: document.createElement("input"),
            endTimeToggle: document.createElement("input"),
            continuousPlaybackToggle: document.createElement("input"),
            loopPlaybackToggle: document.createElement("input"),
            playbackSettingsGroup: document.createElement("section"),
            stopAtEndTime: true
        });
        const controller = createPlaybackSettingsController({
            ui,
            callbacks: createPlaybackSettingsCallbacks({
                restoreActivePlayback: () => {
                    restoreCount += 1;
                }
            })
        });
        let restoreCount = 0;

        controller.setupPlaybackSettings();
        ui.el.endTimeToggle.checked = false;
        invokeListener(ui.el.endTimeToggle, "change", {});

        assert.equal(ui.playback.stopAtEndTime, false);
        assert.equal(globalThis.localStorage.getItem("stopAtEndTime"), "false");
        assert.equal(restoreCount, 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: continuous and loop toggles persist playback preferences", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "true");
        globalThis.localStorage.setItem("showExperimentalPlaybackSettings", "true");
        const ui = createPlaybackSettingsUiState({
            thumbToggle: document.createElement("input"),
            experimentalPlaybackToggle: document.createElement("input"),
            endTimeToggle: document.createElement("input"),
            continuousPlaybackToggle: document.createElement("input"),
            loopPlaybackToggle: document.createElement("input"),
            playbackSettingsGroup: document.createElement("section")
        });
        const controller = createPlaybackSettingsController({
            ui,
            callbacks: createPlaybackSettingsCallbacks()
        });

        controller.setupPlaybackSettings();
        ui.el.continuousPlaybackToggle.checked = true;
        invokeListener(ui.el.continuousPlaybackToggle, "change", {});
        ui.el.loopPlaybackToggle.checked = true;
        invokeListener(ui.el.loopPlaybackToggle, "change", {});

        assert.equal(ui.playback.continuousPlayback, true);
        assert.equal(ui.playback.loopPlayback, true);
        assert.equal(globalThis.localStorage.getItem("continuousPlayback"), "true");
        assert.equal(globalThis.localStorage.getItem("loopPlayback"), "true");
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: experimental playback toggle shows and hides playback settings", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "true");
        const ui = createPlaybackSettingsUiState({
            thumbToggle: document.createElement("input"),
            experimentalPlaybackToggleSection: document.createElement("div"),
            experimentalPlaybackToggle: document.createElement("input"),
            endTimeToggle: document.createElement("input"),
            continuousPlaybackToggle: document.createElement("input"),
            loopPlaybackToggle: document.createElement("input"),
            playbackSettingsGroup: document.createElement("section")
        });
        const controller = createPlaybackSettingsController({
            ui,
            callbacks: createPlaybackSettingsCallbacks()
        });

        controller.setupPlaybackSettings();
        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.el.experimentalPlaybackToggleSection.hidden, false);
        assert.equal(ui.el.experimentalPlaybackToggleSection.getAttribute("aria-hidden"), "false");
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");

        ui.el.experimentalPlaybackToggle.checked = true;
        invokeListener(ui.el.experimentalPlaybackToggle, "change", {});

        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(globalThis.localStorage.getItem("showExperimentalPlaybackSettings"), "true");
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "false");
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: enabling experimental playback restores stored playback preferences", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "true");
        globalThis.localStorage.setItem("showExperimentalPlaybackSettings", "false");
        globalThis.localStorage.setItem("stopAtEndTime", "true");
        globalThis.localStorage.setItem("continuousPlayback", "true");
        globalThis.localStorage.setItem("loopPlayback", "false");
        const ui = createPlaybackSettingsUiState({
            thumbToggle: document.createElement("input"),
            experimentalPlaybackToggleSection: document.createElement("div"),
            experimentalPlaybackToggle: document.createElement("input"),
            endTimeToggle: document.createElement("input"),
            continuousPlaybackToggle: document.createElement("input"),
            loopPlaybackToggle: document.createElement("input"),
            playbackSettingsGroup: document.createElement("section")
        });
        const controller = createPlaybackSettingsController({
            ui,
            callbacks: createPlaybackSettingsCallbacks()
        });

        controller.setupPlaybackSettings();
        ui.el.experimentalPlaybackToggle.checked = true;
        invokeListener(ui.el.experimentalPlaybackToggle, "change", {});

        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, true);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.endTimeToggle.checked, true);
        assert.equal(ui.el.continuousPlaybackToggle.checked, true);
        assert.equal(ui.el.loopPlaybackToggle.checked, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "false");
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});
test("setupPlaybackSettings: thumbnail toggle controls experimental playback entry visibility", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        globalThis.localStorage.setItem("showThumbnails", "true");
        globalThis.localStorage.setItem("showExperimentalPlaybackSettings", "true");
        globalThis.localStorage.setItem("continuousPlayback", "true");
        const ui = createPlaybackSettingsUiState({
            thumbToggle: document.createElement("input"),
            experimentalPlaybackToggleSection: document.createElement("div"),
            experimentalPlaybackToggle: document.createElement("input"),
            endTimeToggle: document.createElement("input"),
            continuousPlaybackToggle: document.createElement("input"),
            loopPlaybackToggle: document.createElement("input"),
            playbackSettingsGroup: document.createElement("section")
        });
        const controller = createPlaybackSettingsController({
            ui,
            callbacks: createPlaybackSettingsCallbacks()
        });

        controller.setupPlaybackSettings();
        assert.equal(ui.el.experimentalPlaybackToggleSection.hidden, false);
        assert.equal(ui.el.experimentalPlaybackToggle.disabled, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.playback.continuousPlayback, true);

        ui.el.thumbToggle.checked = false;
        invokeListener(ui.el.thumbToggle, "change", {});

        assert.equal(ui.el.experimentalPlaybackToggleSection.hidden, true);
        assert.equal(ui.el.experimentalPlaybackToggleSection.getAttribute("aria-hidden"), "true");
        assert.equal(ui.el.experimentalPlaybackToggle.disabled, true);
        assert.equal(ui.el.experimentalPlaybackToggle.checked, true);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(ui.playback.continuousPlayback, false);

        ui.el.thumbToggle.checked = true;
        invokeListener(ui.el.thumbToggle, "change", {});

        assert.equal(ui.el.experimentalPlaybackToggleSection.hidden, false);
        assert.equal(ui.el.experimentalPlaybackToggleSection.getAttribute("aria-hidden"), "false");
        assert.equal(ui.el.experimentalPlaybackToggle.disabled, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.playback.continuousPlayback, true);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});
