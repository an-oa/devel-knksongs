import { getPlaybackUiState, getSearchUiState } from "../lib/ui-slices.mjs?v=23";

const THUMBNAIL_STORAGE_KEY = "showThumbnails";
const EXPERIMENTAL_PLAYBACK_SETTINGS_STORAGE_KEY = "showExperimentalPlaybackSettings";
const EXPERIMENTAL_PLAYBACK_SETTINGS_HIDDEN_RESET_STORAGE_KEY = "showExperimentalPlaybackSettingsHiddenResetV1";
const STOP_AT_END_TIME_STORAGE_KEY = "stopAtEndTime";
const CONTINUOUS_PLAYBACK_STORAGE_KEY = "continuousPlayback";
const LOOP_PLAYBACK_STORAGE_KEY = "loopPlayback";
const LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS = [
    EXPERIMENTAL_PLAYBACK_SETTINGS_STORAGE_KEY,
    EXPERIMENTAL_PLAYBACK_SETTINGS_HIDDEN_RESET_STORAGE_KEY,
    STOP_AT_END_TIME_STORAGE_KEY,
    CONTINUOUS_PLAYBACK_STORAGE_KEY,
    LOOP_PLAYBACK_STORAGE_KEY
];
const PLAYBACK_SETTING_SCOPES = {
    PERSISTED: "persisted",
    PAGE: "page"
};
const PLAYBACK_SETTING_KINDS = {
    VISIBILITY: "visibility",
    BEHAVIOR: "behavior"
};
const INITIAL_PLAYBACK_SETTING_VALUES = {
    stopAtEndTime: true,
    continuousPlayback: false,
    loopPlayback: false
};

/**
 * 再生設定の保存値反映とトグル配線を扱うコントローラーを作成する。
 * @param {{ ui: *, callbacks: * }} input
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
     * 実験的な再生設定が有効かを返す。
     * @returns {boolean}
     */
    function isExperimentalPlaybackSettingsEffective() {
        return Boolean(playbackUi.showThumbnails && playbackUi.showExperimentalPlaybackSettings);
    }

    /**
     * 非表示にする再生設定内にフォーカスがある場合は設定パネルの戻るボタンへ移す。
     * @param {HTMLElement | null} playbackSettingsGroup
     */
    function moveFocusBeforeHidingPlaybackSettings(playbackSettingsGroup) {
        if (!playbackSettingsGroup || playbackSettingsGroup.hidden) return;
        if (!playbackSettingsGroup.contains(document.activeElement)) return;
        const closeSettingsPanelBtn = ui.el.closeSettingsPanelBtn;
        if (closeSettingsPanelBtn) closeSettingsPanelBtn.focus();
    }

    /**
     * 実験的な再生セクションの表示状態を切り替える。
     */
    function syncExperimentalPlaybackVisibility() {
        const value = isExperimentalPlaybackSettingsEffective();
        const playbackSettingsGroup = ui.el.playbackSettingsGroup;
        if (!playbackSettingsGroup) return;
        if (!value) moveFocusBeforeHidingPlaybackSettings(playbackSettingsGroup);
        playbackSettingsGroup.hidden = !value;
        playbackSettingsGroup.setAttribute("aria-hidden", value ? "false" : "true");
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
        for (const definition of playbackBehaviorDefinitions) {
            playbackBehaviorPageValues.set(definition.stateKey, Boolean(definition.defaultValue));
            const nextValue = getPlaybackBehaviorEffectiveValue(
                definition,
                isExperimentalPlaybackSettingsEffective()
            );
            applyPlaybackDefinitionValue(definition, nextValue, "afterStorageApply");
        }
    }

    /**
     * 現在値とトグル状態へ設定値を反映する。
     * @param {*} definition
     * @param {boolean} value
     */
    function applyPlaybackSettingValue(definition, value) {
        playbackUi[definition.stateKey] = value;
        const toggle = definition.elementKey ? ui.el[definition.elementKey] : null;
        if (toggle) toggle.checked = value;
        if (typeof definition.syncValue === "function") {
            definition.syncValue(value);
        }
    }

    /**
     * 設定定義へ現在値を反映し、副作用フックがあれば呼ぶ。
     * @param {*} definition
     * @param {boolean} nextValue
     * @param {"afterStorageApply" | "afterToggleChange"} hookName
     */
    function applyPlaybackDefinitionValue(definition, nextValue, hookName) {
        const previousValue = Boolean(playbackUi[definition.stateKey]);
        applyPlaybackSettingValue(definition, nextValue);
        if (typeof definition[hookName] === "function") {
            definition[hookName](previousValue, nextValue);
        }
    }

    /**
     * ページ内だけで保持する再生挙動設定かを返す。
     * @param {*} definition
     * @returns {boolean}
     */
    function isPagePlaybackBehaviorDefinition(definition) {
        return definition.scope === PLAYBACK_SETTING_SCOPES.PAGE
            && definition.kind === PLAYBACK_SETTING_KINDS.BEHAVIOR;
    }

    const playbackBehaviorDefinitions = [
        {
            scope: PLAYBACK_SETTING_SCOPES.PAGE,
            kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
            stateKey: "stopAtEndTime",
            elementKey: "endTimeToggle",
            defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.stopAtEndTime,
            effectiveWhenHidden: true,
            afterStorageApply(previousValue, nextValue) {
                if (previousValue !== nextValue) restoreActivePlayback();
            },
            afterToggleChange(previousValue, nextValue) {
                if (previousValue !== nextValue) restoreActivePlayback();
            }
        },
        {
            scope: PLAYBACK_SETTING_SCOPES.PAGE,
            kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
            stateKey: "continuousPlayback",
            elementKey: "continuousPlaybackToggle",
            defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.continuousPlayback,
            hiddenValue: false
        },
        {
            scope: PLAYBACK_SETTING_SCOPES.PAGE,
            kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
            stateKey: "loopPlayback",
            elementKey: "loopPlaybackToggle",
            defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.loopPlayback,
            hiddenValue: false
        }
    ];

    /**
     * 表示状態に応じた再生設定の実効値を返す。
     * @param {*} definition
     * @param {boolean} experimentalEnabled
     * @returns {boolean}
     */
    function getPlaybackBehaviorEffectiveValue(definition, experimentalEnabled) {
        if (experimentalEnabled || definition.effectiveWhenHidden) {
            return Boolean(playbackBehaviorPageValues.get(definition.stateKey));
        }
        return Boolean(definition.hiddenValue);
    }

    /**
     * 実験設定の表示状態に応じて、隠し設定の実効値を反映する。
     * @param {"afterStorageApply" | "afterToggleChange"} hookName
     */
    function applyExperimentalPlaybackSettingValues(hookName) {
        const experimentalEnabled = isExperimentalPlaybackSettingsEffective();
        for (const definition of playbackBehaviorDefinitions) {
            const nextValue = getPlaybackBehaviorEffectiveValue(definition, experimentalEnabled);
            applyPlaybackDefinitionValue(definition, nextValue, hookName);
        }
    }

    const experimentalPlaybackVisibilityDefinition = {
        scope: PLAYBACK_SETTING_SCOPES.PAGE,
        kind: PLAYBACK_SETTING_KINDS.VISIBILITY,
        stateKey: "showExperimentalPlaybackSettings",
        defaultValue: false,
        syncValue() {
            syncExperimentalPlaybackVisibility();
        },
        afterStorageApply() {
            applyExperimentalPlaybackSettingValues("afterStorageApply");
        },
        afterToggleChange() {
            applyExperimentalPlaybackSettingValues("afterToggleChange");
        }
    };

    const thumbnailVisibilityDefinition = {
        scope: PLAYBACK_SETTING_SCOPES.PERSISTED,
        kind: PLAYBACK_SETTING_KINDS.VISIBILITY,
        interactive: true,
        stateKey: "showThumbnails",
        elementKey: "thumbToggle",
        storageKey: THUMBNAIL_STORAGE_KEY,
        defaultValue: false,
        syncValue(value) {
            document.body.classList.toggle("hide-thumbs", !value);
            syncExperimentalPlaybackVisibility();
            ensureThumbnailPlaybackReady();
        },
        afterStorageApply(previousValue, nextValue) {
            if (previousValue === nextValue || !searchUi.dataReady) return;
            updateDisplay();
            setupScrollObserver();
        },
        afterToggleChange() {
            updateDisplay();
            setupScrollObserver();
            applyExperimentalPlaybackSettingValues("afterToggleChange");
        }
    };

    const playbackSettingDefinitions = [
        thumbnailVisibilityDefinition,
        experimentalPlaybackVisibilityDefinition,
        ...playbackBehaviorDefinitions
    ];

    const persistedDefinitions = playbackSettingDefinitions.filter((definition) => (
        definition.scope === PLAYBACK_SETTING_SCOPES.PERSISTED
    ));

    const interactiveToggleDefinitions = playbackSettingDefinitions.filter((definition) => (
        definition.interactive || isPagePlaybackBehaviorDefinition(definition)
    ));

    /**
     * 保存領域から全再生設定の値を読み出す。
     * @param {Array<*>} definitions
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
     * @param {*} definition
     * @param {boolean} nextValue
     * @param {{ persist?: boolean } | undefined} options
     */
    function applyPlaybackSettingChange(definition, nextValue, options) {
        const shouldPersist = options?.persist !== false;
        if (isPagePlaybackBehaviorDefinition(definition)) {
            if (isExperimentalPlaybackSettingsEffective()) {
                playbackBehaviorPageValues.set(definition.stateKey, Boolean(nextValue));
            }
            const effectiveValue = getPlaybackBehaviorEffectiveValue(
                definition,
                isExperimentalPlaybackSettingsEffective()
            );
            const previousValue = Boolean(playbackUi[definition.stateKey]);
            if (previousValue === effectiveValue) return;
            applyPlaybackSettingValue(definition, effectiveValue);
            if (typeof definition.afterToggleChange === "function") {
                definition.afterToggleChange(previousValue, effectiveValue);
            }
            return;
        }
        const previousValue = Boolean(playbackUi[definition.stateKey]);
        if (previousValue === nextValue) return;
        applyPlaybackSettingValue(definition, nextValue);
        if (shouldPersist && definition.storageKey) localStorage.setItem(definition.storageKey, nextValue);
        if (typeof definition.afterToggleChange === "function") {
            definition.afterToggleChange(previousValue, nextValue);
        }
    }

    /**
     * トグル変更時の設定更新と副作用実行を行う。
     * @param {*} definition
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
     * @returns {*}
     */
    function getPlaybackSettingsSnapshot() {
        return {
            showThumbnails: Boolean(playbackUi.showThumbnails),
            showExperimentalPlaybackSettings: Boolean(playbackUi.showExperimentalPlaybackSettings),
            stopAtEndTime: Boolean(playbackUi.stopAtEndTime),
            continuousPlayback: Boolean(playbackUi.continuousPlayback),
            loopPlayback: Boolean(playbackUi.loopPlayback)
        };
    }

    /**
     * Inspect の console へ公開する再生設定 API を作る。
     * @returns {*}
     */
    function createConsoleApi() {
        const api = {};
        Object.defineProperties(api, {
            showExperimentalPlaybackSettings: {
                enumerable: true,
                get() {
                    return getPlaybackSettingsSnapshot().showExperimentalPlaybackSettings;
                },
                set(value) {
                    setExperimentalPlaybackSettings(Boolean(value));
                }
            },
            state: {
                enumerable: true,
                get() {
                    return getPlaybackSettingsSnapshot();
                }
            }
        });
        api.setExperimentalPlaybackSettings = (value) => setExperimentalPlaybackSettings(Boolean(value));
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
