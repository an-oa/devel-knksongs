/**
 * 検索関連の UI ランタイム状態を返す。
 * @param {*} ui
 */
export function getSearchUiState(ui) {
    return ui.search;
}

/**
 * 日付フィルタ関連の UI ランタイム状態を返す。
 * @param {*} ui
 */
export function getDateUiState(ui) {
    return ui.date;
}

/**
 * 再生・サムネイル関連の UI ランタイム状態を返す。
 * @param {*} ui
 */
export function getPlaybackUiState(ui) {
    return ui.playback;
}

/**
 * 検索補助のルックアップ状態を返す。
 * @param {*} ui
 */
export function getLookupUiState(ui) {
    return ui.lookup;
}

/**
 * 描画キャッシュ関連の UI ランタイム状態を返す。
 * @param {*} ui
 */
export function getRenderUiState(ui) {
    return ui.render;
}

/**
 * ブックマークパネル関連の UI ランタイム状態を返す。
 * @param {*} ui
 */
export function getBookmarkPanelUiState(ui) {
    return ui.bookmarkPanel;
}

/**
 * 設定パネル関連の UI ランタイム状態を返す。
 * @param {*} ui
 */
export function getSettingsPanelUiState(ui) {
    return ui.settingsPanel;
}
