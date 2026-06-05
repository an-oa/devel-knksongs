import assert from "node:assert/strict";
import { createPlaybackSettingsController } from "../../app/controllers/playback-settings.mjs";
import { LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS } from "../../app/lib/playback-settings/definitions.mjs";

/**
 * @typedef {{
 *   thumbToggle?: HTMLInputElement | null,
 *   playArchiveToEndToggle?: HTMLInputElement | null,
 *   continuousPlaybackToggle?: HTMLInputElement | null,
 *   loopPlaybackToggle?: HTMLInputElement | null,
 *   playbackSettingsGroup?: HTMLElement | null,
 *   experimentalPlaybackSettingsGroup?: HTMLElement | null,
 *   themeToggle?: HTMLInputElement | null,
 *   dataReady?: boolean,
 *   showThumbnails?: boolean,
 *   showExperimentalPlaybackSettings?: boolean,
 *   playArchiveToEnd?: boolean,
 *   continuousPlayback?: boolean,
 *   loopPlayback?: boolean,
 *   activeThumb?: HTMLElement | null
 * }} PlaybackSettingsUiStateInput
 */

/**
 * @typedef {{
 *   thumbToggle: HTMLInputElement | null,
 *   playArchiveToEndToggle: HTMLInputElement | null,
 *   continuousPlaybackToggle: HTMLInputElement | null,
 *   loopPlaybackToggle: HTMLInputElement | null,
 *   playbackSettingsGroup: HTMLElement | null,
 *   experimentalPlaybackSettingsGroup: HTMLElement | null,
 *   themeToggle: HTMLInputElement | null,
 *   closeSettingsPanelBtn?: HTMLElement | null
 * }} PlaybackSettingsUiElements
 */

/**
 * @typedef {{ dataReady: boolean }} PlaybackSearchUiState
 */

/**
 * @typedef {{
 *   showThumbnails: boolean,
 *   showExperimentalPlaybackSettings: boolean,
 *   playArchiveToEnd: boolean,
 *   continuousPlayback: boolean,
 *   loopPlayback: boolean,
 *   activeThumb: HTMLElement | null,
 *   scrollObserver: IntersectionObserver | null
 * }} PlaybackRuntimeUiState
 */

/**
 * @typedef {{
 *   el: PlaybackSettingsUiElements,
 *   search: PlaybackSearchUiState,
 *   playback: PlaybackRuntimeUiState
 * }} PlaybackSettingsUiState
 */

/**
 * @typedef {{
 *   ensureThumbnailPlaybackReady?: () => void,
 *   restoreActivePlayback?: () => void,
 *   updateDisplay?: () => void,
 *   setupScrollObserver?: () => void
 * }} PlaybackSettingsCallbacksInput
 */

/**
 * @typedef {{
 *   ensureThumbnailPlaybackReady: () => void,
 *   restoreActivePlayback: () => void,
 *   updateDisplay: () => void,
 *   setupScrollObserver: () => void
 * }} PlaybackSettingsCallbacks
 */

/**
 * @typedef {{
 *   setupPlaybackSettings: () => void,
 *   applyPlaybackSettingsFromStorage: () => void,
 *   setExperimentalPlaybackSettings: (value: boolean) => boolean
 * }} PlaybackSettingsController
 */

/**
 * @typedef {{
 *   ui?: PlaybackSettingsUiStateInput,
 *   callbacks?: PlaybackSettingsCallbacksInput
 * }} PlaybackSettingsFixtureInput
 */

/**
 * テスト用の localStorage 互換オブジェクトを作る。
 */
export function createFakeLocalStorage() {
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
 * @param {PlaybackSettingsUiStateInput} input
 * @returns {PlaybackSettingsUiState}
 */
function createPlaybackSettingsUiState(input) {
    return {
        el: {
            thumbToggle: input.thumbToggle ?? null,
            playArchiveToEndToggle: input.playArchiveToEndToggle ?? null,
            continuousPlaybackToggle: input.continuousPlaybackToggle ?? null,
            loopPlaybackToggle: input.loopPlaybackToggle ?? null,
            playbackSettingsGroup: input.playbackSettingsGroup ?? null,
            experimentalPlaybackSettingsGroup: input.experimentalPlaybackSettingsGroup ?? null,
            themeToggle: input.themeToggle ?? null
        },
        search: {
            dataReady: input.dataReady ?? false
        },
        playback: {
            showThumbnails: input.showThumbnails ?? true,
            showExperimentalPlaybackSettings: input.showExperimentalPlaybackSettings ?? false,
            playArchiveToEnd: input.playArchiveToEnd ?? false,
            continuousPlayback: input.continuousPlayback ?? false,
            loopPlayback: input.loopPlayback ?? false,
            activeThumb: input.activeThumb ?? null,
            scrollObserver: null
        }
    };
}

/**
 * 再生設定テスト用の依存関数を作る。
 * @param {PlaybackSettingsCallbacksInput | undefined} input
 * @returns {PlaybackSettingsCallbacks}
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
 * @param {PlaybackSettingsFixtureInput | undefined} input
 * @returns {{ ui: PlaybackSettingsUiState, controller: PlaybackSettingsController }}
 */
export function createPlaybackSettingsFixture(input) {
    const fixture = input || {};
    const playbackSettingsGroup = document.createElement("section");
    playbackSettingsGroup.hidden = true;
    playbackSettingsGroup.setAttribute("aria-hidden", "true");
    const experimentalPlaybackSettingsGroup = document.createElement("div");
    experimentalPlaybackSettingsGroup.hidden = true;
    experimentalPlaybackSettingsGroup.setAttribute("aria-hidden", "true");
    const ui = createPlaybackSettingsUiState({
        thumbToggle: document.createElement("input"),
        playArchiveToEndToggle: document.createElement("input"),
        continuousPlaybackToggle: document.createElement("input"),
        loopPlaybackToggle: document.createElement("input"),
        playbackSettingsGroup,
        experimentalPlaybackSettingsGroup,
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
 * @param {Record<string, string>} values
 */
export function seedPlaybackSettingsStorage(values) {
    for (const [key, value] of Object.entries(values)) {
        globalThis.localStorage.setItem(key, value);
    }
}

/**
 * 旧再生設定の保存値が残っていないことを確認する。
 */
export function assertLegacyPlaybackSettingsStorageCleared() {
    for (const key of LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS) {
        assert.equal(globalThis.localStorage.getItem(key), null);
    }
}

/**
 * 設定グループの hidden と aria-hidden が表示状態に合っていることを確認する。
 * @param {HTMLElement | null} settingsGroup
 * @param {boolean} visible
 */
function assertSettingsGroupVisibility(settingsGroup, visible) {
    assert.ok(settingsGroup);
    assert.equal(settingsGroup.hidden, !visible);
    assert.equal(settingsGroup.getAttribute("aria-hidden"), visible ? "false" : "true");
}

/**
 * 再生設定グループが表示状態であることを確認する。
 * @param {PlaybackSettingsUiState} ui
 */
export function assertPlaybackSettingsGroupVisible(ui) {
    assertSettingsGroupVisibility(ui.el.playbackSettingsGroup, true);
}

/**
 * 再生設定グループが非表示であることを確認する。
 * @param {PlaybackSettingsUiState} ui
 */
export function assertPlaybackSettingsGroupHidden(ui) {
    assertSettingsGroupVisibility(ui.el.playbackSettingsGroup, false);
}

/**
 * 実験的な再生設定項目が非表示であることを確認する。
 * @param {PlaybackSettingsUiState} ui
 */
export function assertExperimentalPlaybackSettingsHidden(ui) {
    assertSettingsGroupVisibility(ui.el.experimentalPlaybackSettingsGroup, false);
}

/**
 * 実験的な再生設定項目が表示状態であることを確認する。
 * @param {PlaybackSettingsUiState} ui
 */
export function assertExperimentalPlaybackSettingsVisible(ui) {
    assertSettingsGroupVisibility(ui.el.experimentalPlaybackSettingsGroup, true);
}
