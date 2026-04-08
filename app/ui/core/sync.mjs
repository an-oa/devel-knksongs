/**
 * 画面復帰時の UI 再同期をまとめて扱うコントローラーを作成する。
 * @param {{
 *   uiSyncPasses: number,
 *   syncSearchUI: () => void,
 *   applyThemeFromStorage: () => void,
 *   applyThumbnailFromStorage: () => void
 * }} input
 */
export function createUiSyncController(input) {
    const {
        uiSyncPasses,
        syncSearchUI,
        applyThemeFromStorage,
        applyThumbnailFromStorage
    } = input;

    /**
     * オプションに応じて UI の見た目と検索状態を同期する。
     * @param {{ visual?: boolean, search?: boolean } | undefined} options
     */
    function syncUiState(options) {
        const opts = options || {};
        if (opts.visual !== false) syncVisualUI();
        if (opts.search !== false) syncSearchUI();
    }

    /**
     * UI 同期を実行し、必要に応じて次フレームでも再同期する。
     * @param {{ visual?: boolean, search?: boolean } | undefined} options
     */
    function scheduleSyncUiState(options) {
        syncUiState(options);
        if (uiSyncPasses < 2) return;
        requestAnimationFrame(() => syncUiState(options));
    }

    /**
     * 遅延付きで見た目のみの UI 同期を予約する。
     * @param {number | undefined} delayMs
     */
    function scheduleDelayedVisualSync(delayMs) {
        const delay = Number.isFinite(delayMs) ? delayMs : 200;
        setTimeout(() => scheduleSyncUiState({ visual: true, search: false }), delay);
    }

    /**
     * フォーカス復帰時の UI 同期を行う。
     */
    function handleFocusSync() {
        scheduleSyncUiState();
    }

    /**
     * ページ再表示時に UI 同期を行う。
     */
    function handleVisibilitySync() {
        if (document.visibilityState !== "visible") return;
        scheduleSyncUiState();
    }

    /**
     * pageshow 時に同期と遅延ビジュアル同期を行う。
     */
    function handlePageShowSync() {
        scheduleSyncUiState();
        scheduleDelayedVisualSync();
    }

    /**
     * テーマとサムネイル表示の UI 状態を同期する。
     */
    function syncVisualUI() {
        applyThemeFromStorage();
        applyThumbnailFromStorage();
    }

    /**
     * フォーカス・表示状態・pageshow の同期イベントを登録する。
     */
    function setupSyncEvents() {
        window.addEventListener("focus", handleFocusSync);
        document.addEventListener("visibilitychange", handleVisibilitySync);
        window.addEventListener("pageshow", handlePageShowSync);
    }

    return {
        scheduleSyncUiState,
        scheduleDelayedVisualSync,
        setupSyncEvents
    };
}
