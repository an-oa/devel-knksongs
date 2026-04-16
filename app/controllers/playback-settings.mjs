import { getPlaybackUiState, getSearchUiState } from "../lib/ui-slices.mjs?v=11";

const THUMBNAIL_STORAGE_KEY = "showThumbnails";
const STOP_AT_END_TIME_STORAGE_KEY = "stopAtEndTime";
const CONTINUOUS_PLAYBACK_STORAGE_KEY = "continuousPlayback";
const LOOP_PLAYBACK_STORAGE_KEY = "loopPlayback";

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

    /**
     * 再生設定定義を返す。
     * @returns {Array<*>}
     */
    function getPlaybackSettingDefinitions() {
        return [
            {
                stateKey: "showThumbnails",
                elementKey: "thumbToggle",
                storageKey: THUMBNAIL_STORAGE_KEY,
                defaultValue: false,
                syncValue(value) {
                    document.body.classList.toggle("hide-thumbs", !value);
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
                }
            },
            {
                stateKey: "stopAtEndTime",
                elementKey: "endTimeToggle",
                storageKey: STOP_AT_END_TIME_STORAGE_KEY,
                defaultValue: false,
                afterStorageApply(previousValue, nextValue) {
                    if (previousValue !== nextValue) restoreActivePlayback();
                },
                afterToggleChange(previousValue, nextValue) {
                    if (previousValue !== nextValue) restoreActivePlayback();
                }
            },
            {
                stateKey: "continuousPlayback",
                elementKey: "continuousPlaybackToggle",
                storageKey: CONTINUOUS_PLAYBACK_STORAGE_KEY,
                defaultValue: false
            },
            {
                stateKey: "loopPlayback",
                elementKey: "loopPlaybackToggle",
                storageKey: LOOP_PLAYBACK_STORAGE_KEY,
                defaultValue: false
            }
        ];
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
     * 現在値とトグル状態へ設定値を反映する。
     * @param {*} definition
     * @param {boolean} value
     */
    function applyPlaybackSettingValue(definition, value) {
        playbackUi[definition.stateKey] = value;
        const toggle = ui.el[definition.elementKey];
        if (toggle) toggle.checked = value;
        if (typeof definition.syncValue === "function") {
            definition.syncValue(value);
        }
    }

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
     * トグル変更時の設定更新と副作用実行を行う。
     * @param {*} definition
     * @param {boolean} nextValue
     */
    function handlePlaybackSettingChange(definition, nextValue) {
        const previousValue = Boolean(playbackUi[definition.stateKey]);
        if (previousValue === nextValue) return;
        applyPlaybackSettingValue(definition, nextValue);
        localStorage.setItem(definition.storageKey, nextValue);
        if (typeof definition.afterToggleChange === "function") {
            definition.afterToggleChange(previousValue, nextValue);
        }
    }

    /**
     * 現在の再生設定を UI 状態とトグルへ反映する。
     */
    function applyPlaybackSettingsFromStorage() {
        const definitions = getPlaybackSettingDefinitions();
        const nextValues = readPlaybackSettingValues(definitions);
        for (const definition of definitions) {
            const previousValue = Boolean(playbackUi[definition.stateKey]);
            const nextValue = Boolean(nextValues.get(definition.stateKey));
            applyPlaybackSettingValue(definition, nextValue);
            if (typeof definition.afterStorageApply === "function") {
                definition.afterStorageApply(previousValue, nextValue);
            }
        }
    }

    /**
     * 再生設定トグルを初期化して変更内容を保存する。
     */
    function setupPlaybackSettings() {
        const definitions = getPlaybackSettingDefinitions();
        applyPlaybackSettingsFromStorage();
        for (const definition of definitions) {
            const toggle = ui.el[definition.elementKey];
            if (!toggle) continue;
            toggle.addEventListener("change", () => {
                handlePlaybackSettingChange(definition, toggle.checked);
            });
        }
    }

    return {
        setupPlaybackSettings,
        applyPlaybackSettingsFromStorage
    };
}
