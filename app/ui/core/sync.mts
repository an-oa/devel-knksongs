type UiSyncOptions = {
    visual?: boolean;
    search?: boolean;
};

type UiSyncControllerInput = {
    uiSyncPasses: number;
    syncSearchUI: (options?: UiSyncOptions) => void;
    applyThemeFromStorage: () => void;
    applyPlaybackSettingsFromStorage: () => void;
};

/**
 * 画面復帰時の UI 再同期をまとめて扱うコントローラーを作成する。
 * @param {{
 *   uiSyncPasses: number,
 *   syncSearchUI: (options?: { visual?: boolean, search?: boolean }) => void,
 *   applyThemeFromStorage: () => void,
 *   applyPlaybackSettingsFromStorage: () => void
 * }} input
 */
export function createUiSyncController(input: UiSyncControllerInput) {
    const {
        uiSyncPasses,
        syncSearchUI,
        applyThemeFromStorage,
        applyPlaybackSettingsFromStorage
    } = input;

    /**
     * オプションに応じて UI の見た目と検索状態を同期する。
     * @param {{ visual?: boolean, search?: boolean } | undefined} [options]
     */
    function syncUiState(options?: UiSyncOptions): void {
        const opts = options || {};
        if (opts.visual !== false) syncVisualUI();
        if (opts.search !== false) syncSearchUI();
    }

    /**
     * UI 同期を実行し、必要に応じて次フレームでも再同期する。
     * @param {{ visual?: boolean, search?: boolean } | undefined} [options]
     */
    function scheduleSyncUiState(options?: UiSyncOptions): void {
        syncUiState(options);
        if (uiSyncPasses < 2) return;
        requestAnimationFrame(() => syncUiState(options));
    }

    /**
     * 遅延付きで見た目のみの UI 同期を予約する。
     * @param {number | undefined} [delayMs]
     */
    function scheduleDelayedVisualSync(delayMs?: number): void {
        const delay = Number.isFinite(delayMs) ? delayMs : 200;
        setTimeout(() => scheduleSyncUiState({ visual: true, search: false }), delay);
    }

    /**
     * フォーカス復帰時の UI 同期を行う。
     */
    function handleFocusSync(): void {
        scheduleSyncUiState();
    }

    /**
     * ページ再表示時に UI 同期を行う。
     */
    function handleVisibilitySync(): void {
        if (document.visibilityState !== "visible") return;
        scheduleSyncUiState();
    }

    /**
     * pageshow 時に同期と遅延ビジュアル同期を行う。
     */
    function handlePageShowSync(): void {
        scheduleSyncUiState();
        scheduleDelayedVisualSync();
    }

    /**
     * テーマとサムネイル表示の UI 状態を同期する。
     */
    function syncVisualUI(): void {
        applyThemeFromStorage();
        applyPlaybackSettingsFromStorage();
    }

    /**
     * フォーカス・表示状態・pageshow の同期イベントを登録する。
     */
    function setupSyncEvents(): void {
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
