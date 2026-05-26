/**
 * 検索関連の UI ランタイム状態を返す。
 * @param {SearchUiStateSource} ui
 * @returns {SearchUiRuntimeState}
 */
export function getSearchUiState(ui) {
    return ui.search;
}

/**
 * 日付フィルタ関連の UI ランタイム状態を返す。
 * @param {DateUiStateSource} ui
 * @returns {DateUiRuntimeState}
 */
export function getDateUiState(ui) {
    return ui.date;
}

/**
 * 再生・サムネイル関連の UI ランタイム状態を返す。
 * @param {PlaybackUiStateSource} ui
 * @returns {PlaybackUiRuntimeState}
 */
export function getPlaybackUiState(ui) {
    return ui.playback;
}

/**
 * 検索補助のルックアップ状態を返す。
 * @param {LookupUiStateSource} ui
 * @returns {LookupUiRuntimeState}
 */
export function getLookupUiState(ui) {
    return ui.lookup;
}

/**
 * 描画キャッシュ関連の UI ランタイム状態を返す。
 * @param {RenderUiStateSource} ui
 * @returns {RenderUiRuntimeState}
 */
export function getRenderUiState(ui) {
    return ui.render;
}

/**
 * ブックマークパネル関連の UI ランタイム状態を返す。
 * @param {BookmarkPanelUiStateSource} ui
 * @returns {BookmarkPanelUiRuntimeState}
 */
export function getBookmarkPanelUiState(ui) {
    return ui.bookmarkPanel;
}

/**
 * 設定パネル関連の UI ランタイム状態を返す。
 * @param {SettingsPanelUiStateSource} ui
 * @returns {SettingsPanelUiRuntimeState}
 */
export function getSettingsPanelUiState(ui) {
    return ui.settingsPanel;
}
