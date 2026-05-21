import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackSettingsController } from "../app/controllers/playback-settings.mjs";
import { applyThemeFromStorage, setupTheme } from "../app/ui/core/elements.mjs";
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

const LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS = [
    "showExperimentalPlaybackSettings",
    "showExperimentalPlaybackSettingsHiddenResetV1",
    "stopAtEndTime",
    "continuousPlayback",
    "loopPlayback"
];

/**
 * 再生設定系テスト用の UI 状態を作る。
 * @param {*} input
 * @returns {*}
 */
function createPlaybackSettingsUiState(input) {
    return {
        el: {
            thumbToggle: input.thumbToggle ?? null,
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

/**
 * 再生設定系テスト用の controller と標準 DOM を作る。
 * @param {{ ui?: *, callbacks?: * } | undefined} input
 * @returns {{ ui: *, controller: * }}
 */
function createPlaybackSettingsFixture(input) {
    const fixture = input || {};
    const ui = createPlaybackSettingsUiState({
        thumbToggle: document.createElement("input"),
        endTimeToggle: document.createElement("input"),
        continuousPlaybackToggle: document.createElement("input"),
        loopPlaybackToggle: document.createElement("input"),
        playbackSettingsGroup: document.createElement("section"),
        ...(fixture.ui || {})
    });
    const controller = createPlaybackSettingsController({
        ui,
        callbacks: createPlaybackSettingsCallbacks(fixture.callbacks)
    });
    return { ui, controller };
}

/**
 * 再生設定系の保存値をまとめて投入する。
 * @param {*} values
 */
function seedPlaybackSettingsStorage(values) {
    for (const [key, value] of Object.entries(values)) {
        globalThis.localStorage.setItem(key, value);
    }
}

/**
 * 旧再生設定の保存値が残っていないことを確認する。
 */
function assertLegacyPlaybackSettingsStorageCleared() {
    for (const key of LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS) {
        assert.equal(globalThis.localStorage.getItem(key), null);
    }
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
        assert.equal(document.documentElement.style.colorScheme, "dark");
        assert.equal(ui.el.themeToggle.checked, true);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: playback settings are reset to load defaults on boot", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "false",
            showExperimentalPlaybackSettings: "true",
            stopAtEndTime: "true",
            continuousPlayback: "true",
            loopPlayback: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture();

        controller.setupPlaybackSettings();

        assert.equal(ui.playback.showThumbnails, false);
        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, false);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.thumbToggle.checked, false);
        assert.equal(ui.el.endTimeToggle.checked, true);
        assert.equal(ui.el.continuousPlaybackToggle.checked, false);
        assert.equal(ui.el.loopPlaybackToggle.checked, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");
        assert.equal(document.body.classList.contains("hide-thumbs"), true);
        assertLegacyPlaybackSettingsStorageCleared();
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
        seedPlaybackSettingsStorage({
            showThumbnails: "true",
            showExperimentalPlaybackSettings: "false",
            stopAtEndTime: "true",
            continuousPlayback: "true",
            loopPlayback: "false"
        });
        const { ui, controller } = createPlaybackSettingsFixture({
            ui: {
                showThumbnails: false,
                showExperimentalPlaybackSettings: false,
                dataReady: true
            },
            callbacks: {
                updateDisplay: () => {
                    displayUpdateCount += 1;
                }
            }
        });
        let displayUpdateCount = 0;

        controller.applyPlaybackSettingsFromStorage();

        assert.equal(ui.playback.showThumbnails, true);
        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, false);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.thumbToggle.checked, true);
        assert.equal(ui.el.endTimeToggle.checked, true);
        assert.equal(ui.el.continuousPlaybackToggle.checked, false);
        assert.equal(ui.el.loopPlaybackToggle.checked, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");
        assert.equal(document.body.classList.contains("hide-thumbs"), false);
        assert.equal(displayUpdateCount, 1);
        assertLegacyPlaybackSettingsStorageCleared();
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("applyPlaybackSettingsFromStorage: hidden playback settings keep load defaults", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "true",
            showExperimentalPlaybackSettings: "false",
            stopAtEndTime: "true",
            continuousPlayback: "true",
            loopPlayback: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture();

        controller.applyPlaybackSettingsFromStorage();

        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, false);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.endTimeToggle.checked, true);
        assert.equal(ui.el.continuousPlaybackToggle.checked, false);
        assert.equal(ui.el.loopPlaybackToggle.checked, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("applyPlaybackSettingsFromStorage: ui sync keeps page-only experimental playback setting", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "true",
            showExperimentalPlaybackSettings: "false",
            showExperimentalPlaybackSettingsHiddenResetV1: "true",
            continuousPlayback: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture();

        controller.setupPlaybackSettings();
        controller.setExperimentalPlaybackSettings(true);
        controller.applyPlaybackSettingsFromStorage();

        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "false");
        assert.equal(ui.playback.continuousPlayback, false);
        assertLegacyPlaybackSettingsStorageCleared();
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
        seedPlaybackSettingsStorage({
            showThumbnails: "true",
            stopAtEndTime: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture({
            ui: {
                stopAtEndTime: true
            },
            callbacks: {
                restoreActivePlayback: () => {
                    restoreCount += 1;
                }
            }
        });
        let restoreCount = 0;

        controller.setupPlaybackSettings();
        controller.setExperimentalPlaybackSettings(true);
        ui.el.endTimeToggle.checked = false;
        invokeListener(ui.el.endTimeToggle, "change", {});

        assert.equal(ui.playback.stopAtEndTime, false);
        assertLegacyPlaybackSettingsStorageCleared();
        assert.equal(restoreCount, 1);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: continuous and loop toggles keep page playback preferences", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture();

        controller.setupPlaybackSettings();
        controller.setExperimentalPlaybackSettings(true);
        ui.el.continuousPlaybackToggle.checked = true;
        invokeListener(ui.el.continuousPlaybackToggle, "change", {});
        ui.el.loopPlaybackToggle.checked = true;
        invokeListener(ui.el.loopPlaybackToggle, "change", {});

        assert.equal(ui.playback.continuousPlayback, true);
        assert.equal(ui.playback.loopPlayback, true);
        assertLegacyPlaybackSettingsStorageCleared();

        controller.applyPlaybackSettingsFromStorage();

        assert.equal(ui.playback.continuousPlayback, true);
        assert.equal(ui.playback.loopPlayback, true);
        assertLegacyPlaybackSettingsStorageCleared();
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: hidden experimental playback setting shows and hides playback settings", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture();

        controller.setupPlaybackSettings();
        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");

        controller.setExperimentalPlaybackSettings(true);

        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assertLegacyPlaybackSettingsStorageCleared();
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "false");
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: hidden experimental playback setting does not persist across boot", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "true"
        });
        let { ui, controller } = createPlaybackSettingsFixture();

        controller.setupPlaybackSettings();
        controller.setExperimentalPlaybackSettings(true);

        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assertLegacyPlaybackSettingsStorageCleared();

        ({ ui, controller } = createPlaybackSettingsFixture());

        controller.setupPlaybackSettings();

        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assertLegacyPlaybackSettingsStorageCleared();
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: enabling experimental playback keeps load default preferences", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "true",
            showExperimentalPlaybackSettings: "false",
            stopAtEndTime: "true",
            continuousPlayback: "true",
            loopPlayback: "false"
        });
        const { ui, controller } = createPlaybackSettingsFixture();

        controller.setupPlaybackSettings();
        controller.setExperimentalPlaybackSettings(true);

        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, false);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.endTimeToggle.checked, true);
        assert.equal(ui.el.continuousPlaybackToggle.checked, false);
        assert.equal(ui.el.loopPlaybackToggle.checked, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "false");
        assertLegacyPlaybackSettingsStorageCleared();
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: disabling hidden experimental playback clears continuation effects", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture();

        controller.setupPlaybackSettings();
        controller.setExperimentalPlaybackSettings(true);
        ui.el.continuousPlaybackToggle.checked = true;
        invokeListener(ui.el.continuousPlaybackToggle, "change", {});
        ui.el.loopPlaybackToggle.checked = true;
        invokeListener(ui.el.loopPlaybackToggle, "change", {});
        controller.setExperimentalPlaybackSettings(false);

        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, false);
        assert.equal(ui.playback.loopPlayback, false);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assertLegacyPlaybackSettingsStorageCleared();

        controller.setExperimentalPlaybackSettings(true);

        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(ui.playback.continuousPlayback, true);
        assert.equal(ui.playback.loopPlayback, true);
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupPlaybackSettings: hiding playback settings moves focus to settings back button", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        seedPlaybackSettingsStorage({
            showThumbnails: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture();
        ui.el.closeSettingsPanelBtn = document.createElement("button");
        document.body.append(
            ui.el.closeSettingsPanelBtn,
            ui.el.playbackSettingsGroup
        );
        ui.el.playbackSettingsGroup.append(ui.el.loopPlaybackToggle);

        controller.setupPlaybackSettings();
        controller.setExperimentalPlaybackSettings(true);
        ui.el.loopPlaybackToggle.focus();
        controller.setExperimentalPlaybackSettings(false);

        assert.equal(document.activeElement, ui.el.closeSettingsPanelBtn);
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.el.playbackSettingsGroup.getAttribute("aria-hidden"), "true");
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
        seedPlaybackSettingsStorage({
            showThumbnails: "true",
            showExperimentalPlaybackSettings: "true",
            showExperimentalPlaybackSettingsHiddenResetV1: "true",
            continuousPlayback: "true"
        });
        const { ui, controller } = createPlaybackSettingsFixture();

        controller.setupPlaybackSettings();
        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.playback.showExperimentalPlaybackSettings, false);
        assertLegacyPlaybackSettingsStorageCleared();

        controller.setExperimentalPlaybackSettings(true);
        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, false);

        ui.el.thumbToggle.checked = false;
        invokeListener(ui.el.thumbToggle, "change", {});

        assert.equal(ui.el.playbackSettingsGroup.hidden, true);
        assert.equal(ui.playback.showExperimentalPlaybackSettings, true);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, false);

        ui.el.thumbToggle.checked = true;
        invokeListener(ui.el.thumbToggle, "change", {});

        assert.equal(ui.el.playbackSettingsGroup.hidden, false);
        assert.equal(ui.playback.stopAtEndTime, true);
        assert.equal(ui.playback.continuousPlayback, false);
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});

test("setupTheme: toggle change updates document theme class and storage", () => {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createFakeLocalStorage();
    try {
        const themeToggle = document.createElement("input");
        themeToggle.checked = false;
        const ui = {
            el: {
                themeToggle
            }
        };

        setupTheme({ ui });
        assert.equal(document.documentElement.classList.contains("dark-theme"), false);
        assert.equal(document.documentElement.style.colorScheme, "light");

        themeToggle.checked = true;
        invokeListener(themeToggle, "change", {});

        assert.equal(document.documentElement.classList.contains("dark-theme"), true);
        assert.equal(document.documentElement.style.colorScheme, "dark");
        assert.equal(globalThis.localStorage.getItem("theme"), "dark");

        themeToggle.checked = false;
        invokeListener(themeToggle, "change", {});

        assert.equal(document.documentElement.classList.contains("dark-theme"), false);
        assert.equal(document.documentElement.style.colorScheme, "light");
        assert.equal(globalThis.localStorage.getItem("theme"), "light");
    } finally {
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
});
