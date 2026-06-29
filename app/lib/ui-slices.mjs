/**
 * 検索関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "search">} ui
 * @returns {import("../state.types").SearchUiRuntimeState}
 */
export function getSearchUiState(ui) {
    return ui.search;
}

/**
 * 日付フィルタ関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "date">} ui
 * @returns {import("../state.types").DateUiRuntimeState}
 */
export function getDateUiState(ui) {
    return ui.date;
}

/**
 * 再生・サムネイル関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "playback">} ui
 * @returns {import("../state.types").PlaybackUiRuntimeState}
 */
export function getPlaybackUiState(ui) {
    return ui.playback;
}

/**
 * 検索補助のルックアップ状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "lookup">} ui
 * @returns {import("../state.types").LookupUiRuntimeState}
 */
export function getLookupUiState(ui) {
    return ui.lookup;
}

/**
 * 描画キャッシュ関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "render">} ui
 * @returns {import("../state.types").RenderUiRuntimeState}
 */
export function getRenderUiState(ui) {
    return ui.render;
}

/**
 * ブックマークパネル関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "bookmarkPanel">} ui
 * @returns {import("../state.types").BookmarkPanelUiRuntimeState}
 */
export function getBookmarkPanelUiState(ui) {
    return ui.bookmarkPanel;
}

/**
 * 設定パネル関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "settingsPanel">} ui
 * @returns {import("../state.types").SettingsPanelUiRuntimeState}
 */
export function getSettingsPanelUiState(ui) {
    return ui.settingsPanel;
}
