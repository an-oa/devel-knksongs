import type {
    AppUiState,
    BookmarkPanelUiRuntimeState,
    DateUiRuntimeState,
    LookupUiRuntimeState,
    PlaybackUiRuntimeState,
    RenderUiRuntimeState,
    SearchUiRuntimeState,
    SettingsPanelUiRuntimeState
} from "../state.types";

/**
 * 検索関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "search">} ui
 * @returns {import("../state.types").SearchUiRuntimeState}
 */
export function getSearchUiState(ui: Pick<AppUiState, "search">): SearchUiRuntimeState {
    return ui.search;
}

/**
 * 日付フィルタ関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "date">} ui
 * @returns {import("../state.types").DateUiRuntimeState}
 */
export function getDateUiState(ui: Pick<AppUiState, "date">): DateUiRuntimeState {
    return ui.date;
}

/**
 * 再生・サムネイル関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "playback">} ui
 * @returns {import("../state.types").PlaybackUiRuntimeState}
 */
export function getPlaybackUiState(ui: Pick<AppUiState, "playback">): PlaybackUiRuntimeState {
    return ui.playback;
}

/**
 * 検索補助のルックアップ状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "lookup">} ui
 * @returns {import("../state.types").LookupUiRuntimeState}
 */
export function getLookupUiState(ui: Pick<AppUiState, "lookup">): LookupUiRuntimeState {
    return ui.lookup;
}

/**
 * 描画キャッシュ関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "render">} ui
 * @returns {import("../state.types").RenderUiRuntimeState}
 */
export function getRenderUiState(ui: Pick<AppUiState, "render">): RenderUiRuntimeState {
    return ui.render;
}

/**
 * ブックマークパネル関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "bookmarkPanel">} ui
 * @returns {import("../state.types").BookmarkPanelUiRuntimeState}
 */
export function getBookmarkPanelUiState(
    ui: Pick<AppUiState, "bookmarkPanel">
): BookmarkPanelUiRuntimeState {
    return ui.bookmarkPanel;
}

/**
 * 設定パネル関連の UI ランタイム状態を返す。
 * @param {Pick<import("../state.types").AppUiState, "settingsPanel">} ui
 * @returns {import("../state.types").SettingsPanelUiRuntimeState}
 */
export function getSettingsPanelUiState(
    ui: Pick<AppUiState, "settingsPanel">
): SettingsPanelUiRuntimeState {
    return ui.settingsPanel;
}
