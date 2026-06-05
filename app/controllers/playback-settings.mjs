// @ts-check

import { getPlaybackUiState, getSearchUiState } from "../lib/ui-slices.mjs?v=23";
import {
    createPlaybackSettingDefinitions,
    LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS,
    PLAYBACK_SETTING_SCOPES
} from "../lib/playback-settings/definitions.mjs?v=23";
import {
    createInitialPlaybackBehaviorPageValues,
    getPlaybackBehaviorEffectiveValue,
    isPagePlaybackBehaviorDefinition,
    reducePlaybackSettingChange
} from "../lib/playback-settings/value-reducer.mjs?v=23";

/**
 * @typedef {{
 *   playbackSettingsGroup?: HTMLElement | null,
 *   experimentalPlaybackSettingsGroup?: HTMLElement | null,
 *   closeSettingsPanelBtn?: HTMLElement | null,
 *   thumbToggle?: HTMLInputElement | null,
 *   playArchiveToEndToggle?: HTMLInputElement | null,
 *   continuousPlaybackToggle?: HTMLInputElement | null,
 *   loopPlaybackToggle?: HTMLInputElement | null
 * }} PlaybackSettingsUiElements
 */

/**
 * @typedef {{
 *   el: PlaybackSettingsUiElements,
 *   playback: PlaybackUiRuntimeState,
 *   search: SearchUiRuntimeState
 * }} PlaybackSettingsUiState
 */

/**
 * @typedef {{
 *   showThumbnails: boolean,
 *   showExperimentalPlaybackSettings: boolean,
 *   playArchiveToEnd: boolean,
 *   continuousPlayback: boolean,
 *   loopPlayback: boolean
 * }} PlaybackSettingsSnapshot
 */

/**
 * @typedef {{
 *   setExperimentalPlaybackSettings: (value: boolean) => boolean,
 *   readonly showExperimentalPlaybackSettings: boolean,
 *   readonly state: PlaybackSettingsSnapshot
 * }} PlaybackSettingsConsoleApi
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
 *   ui: PlaybackSettingsUiState,
 *   callbacks: PlaybackSettingsCallbacks
 * }} PlaybackSettingsControllerInput
 */

/**
 * @typedef {{
 *   syncValue?: (value: boolean) => void,
 *   afterStorageApply?: (previousValue: boolean, nextValue: boolean) => void,
 *   afterToggleChange?: (previousValue: boolean, nextValue: boolean) => void
 * }} PlaybackSettingEffects
 */

/**
 * 再生設定の保存値反映とトグル配線を扱うコントローラーを作成する。
 * @param {PlaybackSettingsControllerInput} input
 */
export function createPlaybackSettingsController({ ui, callbacks }) {
    const playbackUi = getPlaybackUiState(ui);
    const searchUi = getSearchUiState(ui);
    const ensureThumbnailPlaybackReady = callbacks.ensureThumbnailPlaybackReady;
    const restoreActivePlayback = callbacks.restoreActivePlayback;
    const updateDisplay = callbacks.updateDisplay;
    const setupScrollObserver = callbacks.setupScrollObserver;
    let didApplyInitialPlaybackSettingValues = false;
    const playbackBehaviorPageValues = new Map();

    /**
     * ページ内だけで保持する再生挙動設定を差し替える。
     * @param {Map<string, boolean>} nextValues
     */
    function replacePlaybackBehaviorPageValues(nextValues) {
        playbackBehaviorPageValues.clear();
        for (const [key, value] of nextValues.entries()) {
            playbackBehaviorPageValues.set(key, value);
        }
    }

    /**
     * 実験的な再生設定が有効かを返す。
     * @returns {boolean}
     */
    function isExperimentalPlaybackSettingsEffective() {
        return Boolean(playbackUi.showThumbnails && playbackUi.showExperimentalPlaybackSettings);
    }

    /**
     * 非表示にする設定グループ内にフォーカスがある場合は設定パネルの戻るボタンへ移す。
     * @param {HTMLElement | null} settingsGroup
     */
    function moveFocusBeforeHidingSettingsGroup(settingsGroup) {
        if (!settingsGroup || settingsGroup.hidden) return;
        if (!settingsGroup.contains(document.activeElement)) return;
        const closeSettingsPanelBtn = ui.el.closeSettingsPanelBtn;
        if (closeSettingsPanelBtn) closeSettingsPanelBtn.focus();
    }

    /**
     * 設定グループの表示状態と支援技術向けの露出状態を同期する。
     * @param {HTMLElement | null} settingsGroup
     * @param {boolean} visible
     */
    function syncSettingsGroupVisibility(settingsGroup, visible) {
        if (!settingsGroup) return;
        if (!visible) moveFocusBeforeHidingSettingsGroup(settingsGroup);
        settingsGroup.hidden = !visible;
        settingsGroup.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    /**
     * 再生セクションの表示状態を切り替える。
     */
    function syncPlaybackSettingsVisibility() {
        syncSettingsGroupVisibility(
            ui.el.playbackSettingsGroup,
            Boolean(playbackUi.showThumbnails)
        );
    }

    /**
     * 実験的な再生セクションの表示状態を切り替える。
     */
    function syncExperimentalPlaybackVisibility() {
        syncSettingsGroupVisibility(
            ui.el.experimentalPlaybackSettingsGroup,
            isExperimentalPlaybackSettingsEffective()
        );
    }

    /**
     * 保存済み真偽値設定を返す。
     * @param {string} key
     * @param {boolean} defaultValue
     * @returns {boolean}
     */
    function loadStoredBoolean(key, defaultValue) {
        const savedSetting = localStorage.getItem(key);
        return savedSetting !== null ? (savedSetting === "true") : Boolean(defaultValue);
    }

    /**
     * 旧バージョンで保存していた再生設定を削除する。
     */
    function removeLegacyPlaybackSettingsStorage() {
        for (const key of LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS) {
            localStorage.removeItem(key);
        }
    }

    /**
     * ページロード直後の再生設定をページ内だけの固定値で初期化する。
     */
    function applyInitialPlaybackSettingValuesIfNeeded() {
        if (didApplyInitialPlaybackSettingValues) return;
        didApplyInitialPlaybackSettingValues = true;
        replacePlaybackBehaviorPageValues(createInitialPlaybackBehaviorPageValues(pagePlaybackBehaviorDefinitions));
        for (const definition of pagePlaybackBehaviorDefinitions) {
            const nextValue = getPlaybackBehaviorEffectiveValue(
                definition,
                isExperimentalPlaybackSettingsEffective(),
                playbackBehaviorPageValues
            );
            applyPlaybackDefinitionValue(definition, nextValue, "afterStorageApply");
        }
    }

    /**
     * 現在値とトグル状態へ設定値を反映する。
     * @param {PlaybackSettingDefinition} definition
     * @param {boolean} value
     */
    function applyPlaybackSettingValue(definition, value) {
        playbackUi[definition.stateKey] = value;
        const toggle = definition.elementKey ? ui.el[definition.elementKey] : null;
        if (toggle) toggle.checked = value;
        runPlaybackSettingSyncEffect(definition, value);
    }

    /**
     * 設定定義へ現在値を反映し、副作用フックがあれば呼ぶ。
     * @param {PlaybackSettingDefinition} definition
     * @param {boolean} nextValue
     * @param {"afterStorageApply" | "afterToggleChange"} hookName
     */
    function applyPlaybackDefinitionValue(definition, nextValue, hookName) {
        const previousValue = Boolean(playbackUi[definition.stateKey]);
        applyPlaybackSettingValue(definition, nextValue);
        runPlaybackSettingValueEffect(definition, hookName, previousValue, nextValue);
    }

    /**
     * 実験設定の表示状態に応じて、隠し設定の実効値を反映する。
     * @param {"afterStorageApply" | "afterToggleChange"} hookName
     */
    function applyExperimentalPlaybackSettingValues(hookName) {
        const experimentalEnabled = isExperimentalPlaybackSettingsEffective();
        for (const definition of pagePlaybackBehaviorDefinitions) {
            const nextValue = getPlaybackBehaviorEffectiveValue(
                definition,
                experimentalEnabled,
                playbackBehaviorPageValues
            );
            applyPlaybackDefinitionValue(definition, nextValue, hookName);
        }
    }

    /**
     * サムネイル表示設定を DOM と準備処理へ反映する。
     * @param {boolean} value
     */
    function syncThumbnailVisibility(value) {
        document.body.classList.toggle("hide-thumbs", !value);
        syncPlaybackSettingsVisibility();
        syncExperimentalPlaybackVisibility();
        ensureThumbnailPlaybackReady();
    }

    /**
     * 保存値からサムネイル表示が切り替わった後の描画を更新する。
     * @param {boolean} previousValue
     * @param {boolean} nextValue
     */
    function afterThumbnailStorageApply(previousValue, nextValue) {
        if (previousValue === nextValue || !searchUi.dataReady) return;
        updateDisplay();
        setupScrollObserver();
    }

    /**
     * トグル操作でサムネイル表示が変わった後の描画と隠し再生設定を更新する。
     */
    function afterThumbnailToggleChange() {
        updateDisplay();
        setupScrollObserver();
        applyExperimentalPlaybackSettingValues("afterToggleChange");
    }

    const {
        pagePlaybackBehaviorDefinitions,
        archivePlaybackBehaviorDefinition,
        experimentalPlaybackVisibilityDefinition,
        thumbnailVisibilityDefinition,
        playbackSettingDefinitions
    } = createPlaybackSettingDefinitions();

    /** @type {Map<PlaybackSettingDefinition, PlaybackSettingEffects>} */
    const playbackSettingEffectsByDefinition = new Map([
        [thumbnailVisibilityDefinition, {
            syncValue: syncThumbnailVisibility,
            afterStorageApply: afterThumbnailStorageApply,
            afterToggleChange: afterThumbnailToggleChange
        }],
        [archivePlaybackBehaviorDefinition, {
            afterStorageApply: restoreActivePlaybackWhenChanged,
            afterToggleChange: restoreActivePlaybackWhenChanged
        }],
        [experimentalPlaybackVisibilityDefinition, {
            syncValue: syncExperimentalPlaybackVisibility,
            afterStorageApply: () => applyExperimentalPlaybackSettingValues("afterStorageApply"),
            afterToggleChange: () => applyExperimentalPlaybackSettingValues("afterToggleChange")
        }]
    ]);

    /**
     * 設定値の反映時に同期系の副作用を実行する。
     * @param {PlaybackSettingDefinition} definition
     * @param {boolean} value
     */
    function runPlaybackSettingSyncEffect(definition, value) {
        const effects = playbackSettingEffectsByDefinition.get(definition);
        if (typeof effects?.syncValue === "function") effects.syncValue(value);
    }

    /**
     * 設定値の反映後に保存反映またはトグル操作の副作用を実行する。
     * @param {PlaybackSettingDefinition} definition
     * @param {"afterStorageApply" | "afterToggleChange"} hookName
     * @param {boolean} previousValue
     * @param {boolean} nextValue
     */
    function runPlaybackSettingValueEffect(definition, hookName, previousValue, nextValue) {
        const effects = playbackSettingEffectsByDefinition.get(definition);
        const effect = effects ? effects[hookName] : null;
        if (typeof effect === "function") effect(previousValue, nextValue);
    }

    /**
     * 再生対象範囲が変わったときだけ現在の再生を作り直す。
     * @param {boolean} previousValue
     * @param {boolean} nextValue
     */
    function restoreActivePlaybackWhenChanged(previousValue, nextValue) {
        if (previousValue !== nextValue) restoreActivePlayback();
    }

    const persistedDefinitions = playbackSettingDefinitions.filter((definition) => (
        definition.scope === PLAYBACK_SETTING_SCOPES.PERSISTED
    ));

    const interactiveToggleDefinitions = playbackSettingDefinitions.filter((definition) => (
        definition.interactive || isPagePlaybackBehaviorDefinition(definition)
    ));

    /**
     * 保存領域から全再生設定の値を読み出す。
     * @param {PlaybackSettingDefinition[]} definitions
     * @returns {Map<string, boolean>}
     */
    function readPlaybackSettingValues(definitions) {
        return new Map(definitions.map((definition) => [
            definition.stateKey,
            loadStoredBoolean(definition.storageKey, definition.defaultValue)
        ]));
    }

    /**
     * 設定更新と副作用実行を行う。
     * @param {PlaybackSettingDefinition} definition
     * @param {boolean} nextValue
     * @param {{ persist?: boolean } | undefined} [options]
     */
    function applyPlaybackSettingChange(definition, nextValue, options) {
        const shouldPersist = options?.persist !== false;
        const reduction = reducePlaybackSettingChange({
            definition,
            currentValue: Boolean(playbackUi[definition.stateKey]),
            nextValue,
            experimentalEnabled: isExperimentalPlaybackSettingsEffective(),
            pageValues: playbackBehaviorPageValues
        });
        replacePlaybackBehaviorPageValues(reduction.pageValues);
        if (!reduction.changed) return;
        applyPlaybackSettingValue(definition, reduction.nextValue);
        if (shouldPersist && definition.storageKey) {
            localStorage.setItem(definition.storageKey, String(reduction.nextValue));
        }
        runPlaybackSettingValueEffect(
            definition,
            "afterToggleChange",
            reduction.previousValue,
            reduction.nextValue
        );
    }

    /**
     * トグル変更時の設定更新と副作用実行を行う。
     * @param {PlaybackSettingDefinition} definition
     * @param {boolean} nextValue
     */
    function handlePlaybackSettingChange(definition, nextValue) {
        applyPlaybackSettingChange(definition, nextValue);
    }

    /**
     * 現在の再生設定を UI 状態とトグルへ反映する。
     */
    function applyPlaybackSettingsFromStorage() {
        removeLegacyPlaybackSettingsStorage();
        applyInitialPlaybackSettingValuesIfNeeded();
        const nextValues = readPlaybackSettingValues(persistedDefinitions);
        for (const definition of persistedDefinitions) {
            const nextValue = Boolean(nextValues.get(definition.stateKey));
            applyPlaybackDefinitionValue(definition, nextValue, "afterStorageApply");
        }
        applyPlaybackDefinitionValue(
            experimentalPlaybackVisibilityDefinition,
            Boolean(playbackUi.showExperimentalPlaybackSettings),
            "afterStorageApply"
        );
    }

    /**
     * 再生設定トグルを初期化して変更内容を保存する。
     */
    function setupPlaybackSettings() {
        applyPlaybackSettingsFromStorage();
        for (const definition of interactiveToggleDefinitions) {
            const toggle = ui.el[definition.elementKey];
            if (!toggle) continue;
            toggle.addEventListener("change", () => {
                handlePlaybackSettingChange(definition, toggle.checked);
            });
        }
    }

    /**
     * 実験的な機能の表示状態をページ内だけで更新する。
     * @param {boolean} value
     * @returns {boolean}
     */
    function setExperimentalPlaybackSettings(value) {
        applyPlaybackSettingChange(experimentalPlaybackVisibilityDefinition, Boolean(value), { persist: false });
        return Boolean(playbackUi.showExperimentalPlaybackSettings);
    }

    /**
     * console から確認しやすい再生設定の現在値を返す。
     * @returns {PlaybackSettingsSnapshot}
     */
    function getPlaybackSettingsSnapshot() {
        return {
            showThumbnails: Boolean(playbackUi.showThumbnails),
            showExperimentalPlaybackSettings: Boolean(playbackUi.showExperimentalPlaybackSettings),
            playArchiveToEnd: Boolean(playbackUi.playArchiveToEnd),
            continuousPlayback: Boolean(playbackUi.continuousPlayback),
            loopPlayback: Boolean(playbackUi.loopPlayback)
        };
    }

    /**
     * Inspect の console へ公開する再生設定 API を作る。
     * @returns {PlaybackSettingsConsoleApi}
     */
    function createConsoleApi() {
        /** @type {PlaybackSettingsConsoleApi} */
        const api = {
            get showExperimentalPlaybackSettings() {
                return getPlaybackSettingsSnapshot().showExperimentalPlaybackSettings;
            },
            set showExperimentalPlaybackSettings(value) {
                setExperimentalPlaybackSettings(Boolean(value));
            },
            get state() {
                return getPlaybackSettingsSnapshot();
            },
            setExperimentalPlaybackSettings(value) {
                return setExperimentalPlaybackSettings(Boolean(value));
            }
        };
        return api;
    }

    return {
        setupPlaybackSettings,
        applyPlaybackSettingsFromStorage,
        setExperimentalPlaybackSettings,
        getPlaybackSettingsSnapshot,
        createConsoleApi
    };
}
