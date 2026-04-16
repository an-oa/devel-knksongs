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
     * 現在の再生設定を UI 状態とトグルへ反映する。
     */
    function applyPlaybackSettingsFromStorage() {
        const thumbToggle = ui.el.thumbToggle;
        const endTimeToggle = ui.el.endTimeToggle;
        const continuousPlaybackToggle = ui.el.continuousPlaybackToggle;
        const loopPlaybackToggle = ui.el.loopPlaybackToggle;
        const isShow = loadStoredBoolean(THUMBNAIL_STORAGE_KEY, false);
        const stopAtEndTime = loadStoredBoolean(STOP_AT_END_TIME_STORAGE_KEY, false);
        const continuousPlayback = loadStoredBoolean(CONTINUOUS_PLAYBACK_STORAGE_KEY, false);
        const loopPlayback = loadStoredBoolean(LOOP_PLAYBACK_STORAGE_KEY, false);
        const prevShow = playbackUi.showThumbnails;
        const prevStopAtEndTime = playbackUi.stopAtEndTime;
        playbackUi.showThumbnails = isShow;
        playbackUi.stopAtEndTime = stopAtEndTime;
        playbackUi.continuousPlayback = continuousPlayback;
        playbackUi.loopPlayback = loopPlayback;
        if (thumbToggle) thumbToggle.checked = isShow;
        if (endTimeToggle) endTimeToggle.checked = stopAtEndTime;
        if (continuousPlaybackToggle) continuousPlaybackToggle.checked = continuousPlayback;
        if (loopPlaybackToggle) loopPlaybackToggle.checked = loopPlayback;
        document.body.classList.toggle("hide-thumbs", !isShow);
        ensureThumbnailPlaybackReady();
        if (prevStopAtEndTime !== stopAtEndTime) {
            restoreActivePlayback();
        }
        if (prevShow !== isShow && searchUi.dataReady) {
            updateDisplay();
            setupScrollObserver();
        }
    }

    /**
     * 再生設定トグルを初期化して変更内容を保存する。
     */
    function setupPlaybackSettings() {
        const thumbToggle = ui.el.thumbToggle;
        const endTimeToggle = ui.el.endTimeToggle;
        const continuousPlaybackToggle = ui.el.continuousPlaybackToggle;
        const loopPlaybackToggle = ui.el.loopPlaybackToggle;
        applyPlaybackSettingsFromStorage();

        if (thumbToggle) {
            thumbToggle.addEventListener("change", () => {
                const checked = thumbToggle.checked;
                playbackUi.showThumbnails = checked;
                document.body.classList.toggle("hide-thumbs", !checked);
                localStorage.setItem(THUMBNAIL_STORAGE_KEY, checked);
                ensureThumbnailPlaybackReady();
                updateDisplay();
                setupScrollObserver();
            });
        }
        if (endTimeToggle) {
            endTimeToggle.addEventListener("change", () => {
                const checked = endTimeToggle.checked;
                if (playbackUi.stopAtEndTime === checked) return;
                playbackUi.stopAtEndTime = checked;
                localStorage.setItem(STOP_AT_END_TIME_STORAGE_KEY, checked);
                restoreActivePlayback();
            });
        }
        if (continuousPlaybackToggle) {
            continuousPlaybackToggle.addEventListener("change", () => {
                const checked = continuousPlaybackToggle.checked;
                playbackUi.continuousPlayback = checked;
                localStorage.setItem(CONTINUOUS_PLAYBACK_STORAGE_KEY, checked);
            });
        }
        if (loopPlaybackToggle) {
            loopPlaybackToggle.addEventListener("change", () => {
                const checked = loopPlaybackToggle.checked;
                playbackUi.loopPlayback = checked;
                localStorage.setItem(LOOP_PLAYBACK_STORAGE_KEY, checked);
            });
        }
    }

    return {
        setupPlaybackSettings,
        applyPlaybackSettingsFromStorage
    };
}
