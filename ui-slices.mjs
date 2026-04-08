/**
 * 旧フラット構造のフィールドを別名で扱うためのブリッジを作る。
 * @param {*} target
 * @param {Record<string, string>} fieldMap
 */
function createLegacyFieldBridge(target, fieldMap) {
    const bridge = {};
    Object.entries(fieldMap).forEach(([nextKey, legacyKey]) => {
        Object.defineProperty(bridge, nextKey, {
            get() {
                return target[legacyKey];
            },
            set(value) {
                target[legacyKey] = value;
            },
            enumerable: true,
            configurable: true
        });
    });
    return bridge;
}

/**
 * 検索関連の UI ランタイム状態を返す。
 * 旧テスト用のフラット構造も互換的に扱う。
 * @param {*} ui
 */
export function getSearchUiState(ui) {
    if (ui && ui.search) return ui.search;
    return createLegacyFieldBridge(ui, {
        selectedFormats: "selectedFormats",
        dataReady: "dataReady",
        userTouchedQuery: "userTouchedQuery",
        userTouchedFilters: "userTouchedFilters",
        hasRestoredSearchState: "hasRestoredSearchState",
        debounceId: "searchDebounceId",
        recommendedCache: "recommendedCache"
    });
}

/**
 * 日付フィルタ関連の UI ランタイム状態を返す。
 * 旧テスト用のフラット構造も互換的に扱う。
 * @param {*} ui
 */
export function getDateUiState(ui) {
    if (ui && ui.date) return ui.date;
    return createLegacyFieldBridge(ui, {
        bounds: "dateBounds",
        index: "dateIndex",
        pendingValues: "pendingDateValues"
    });
}

/**
 * 再生・サムネイル関連の UI ランタイム状態を返す。
 * 旧テスト用のフラット構造も互換的に扱う。
 * @param {*} ui
 */
export function getPlaybackUiState(ui) {
    if (ui && ui.playback) return ui.playback;
    return createLegacyFieldBridge(ui, {
        scrollObserver: "scrollObserver",
        showThumbnails: "showThumbnails",
        activeThumb: "activeThumb"
    });
}

/**
 * 検索補助のルックアップ状態を返す。
 * 旧テスト用のフラット構造も互換的に扱う。
 * @param {*} ui
 */
export function getLookupUiState(ui) {
    if (ui && ui.lookup) return ui.lookup;
    return createLegacyFieldBridge(ui, {
        songMapByKey: "songMapByKey",
        songMapByLegacyIndex: "songMapByLegacyIndex",
        songLookupSourceRef: "songLookupSourceRef"
    });
}

/**
 * 描画キャッシュ関連の UI ランタイム状態を返す。
 * 旧テスト用のフラット構造も互換的に扱う。
 * @param {*} ui
 */
export function getRenderUiState(ui) {
    if (ui && ui.render) return ui.render;
    return createLegacyFieldBridge(ui, {
        cardEntriesBySourceKey: "cardEntriesBySourceKey"
    });
}

/**
 * ブックマークパネル関連の UI ランタイム状態を返す。
 * 旧テスト用のフラット構造も互換的に扱う。
 * @param {*} ui
 */
export function getBookmarkPanelUiState(ui) {
    if (ui && ui.bookmarkPanel) return ui.bookmarkPanel;
    return createLegacyFieldBridge(ui, {
        pendingAction: "pendingBookmarkAction",
        returnFocusEl: "bookmarkPanelReturnFocusEl",
        exitClosesSidebar: "bookmarkPanelExitClosesSidebar"
    });
}

/**
 * 設定パネル関連の UI ランタイム状態を返す。
 * 旧テスト用のフラット構造も互換的に扱う。
 * @param {*} ui
 */
export function getSettingsPanelUiState(ui) {
    if (ui && ui.settingsPanel) return ui.settingsPanel;
    return createLegacyFieldBridge(ui, {
        returnFocusEl: "settingsPanelReturnFocusEl"
    });
}
