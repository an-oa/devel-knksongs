import { getDateUiState, getSearchUiState } from "../../lib/ui-slices.mjs?v=16";

/**
 * 曲データの読込と初期データ反映を扱うコントローラーを作成する。
 * @param {{
 *   data: { allSongsRaw: unknown[] },
 *   ui: { el: Record<string, HTMLElement | null>, recommendedCache: unknown, dataReady: boolean, hasRestoredSearchState: boolean },
 *   dataSource: {
 *     loadInitialSongs: (callbacks: { onSongsLoaded: (result: { songs: unknown[], source: string, resetConditions?: boolean }) => void }) => Promise<boolean>
 *   },
 *   callbacks: {
 *     migrateLegacyBookmarkSongRefs: () => void,
 *     applyDateInputRange: (songs: unknown[]) => { minKey: number, maxKey: number } | null,
 *     clampDateInputsToBounds: (minKey: number, maxKey: number) => void,
 *     resetSearchConditions: (shouldSearch: boolean) => void,
 *     scheduleSearch: (options?: { immediate?: boolean }) => void
 *   }
 * }} input
 */
export function createDataLoader(input) {
    const {
        data,
        ui,
        dataSource,
        callbacks
    } = input;
    const searchUi = getSearchUiState(ui);
    const dateUi = getDateUiState(ui);
    const {
        migrateLegacyBookmarkSongRefs,
        applyDateInputRange,
        clampDateInputsToBounds,
        resetSearchConditions,
        scheduleSearch
    } = callbacks;

    /**
     * 曲配列を状態へ反映して初回検索を行う。
     * @param {unknown[]} songs
     * @param {string | null} statusLabel
     * @param {{ resetConditions?: boolean } | undefined} options
     */
    function applyLoadedSongs(songs, statusLabel, options) {
        const shouldResetConditions = options && typeof options.resetConditions === "boolean"
            ? options.resetConditions
            : !searchUi.dataReady;
        data.allSongsRaw = songs;
        migrateLegacyBookmarkSongRefs();
        searchUi.recommendedCache = null;
        const dateBounds = applyDateInputRange(data.allSongsRaw);
        if (dateBounds) {
            clampDateInputsToBounds(dateBounds.minKey, dateBounds.maxKey);
        }
        if (ui.el.searchBox) ui.el.searchBox.disabled = false;
        searchUi.dataReady = true;
        if (statusLabel && ui.el.resultCount) {
            ui.el.resultCount.innerText = statusLabel;
        }
        if (shouldResetConditions && !searchUi.hasRestoredSearchState && !dateUi.pendingValues) {
            resetSearchConditions(false);
        }
        scheduleSearch({ immediate: true });
    }

    /**
     * data source から受け取った曲配列を状態へ反映する。
     * @param {{ songs: unknown[], source: string, resetConditions?: boolean }} result
     */
    function applyDataSourceResult(result) {
        const statusLabel = result.source === "cache" ? "キャッシュを表示中" : null;
        applyLoadedSongs(result.songs, statusLabel, { resetConditions: result.resetConditions });
    }

    /**
     * 曲データを取得し、取得成功時は初期データとして適用する。
     */
    async function loadInitialData() {
        if (ui.el.resultCount) ui.el.resultCount.innerText = "データを読み込み中...";
        const loaded = await dataSource.loadInitialSongs({
            onSongsLoaded: applyDataSourceResult
        });
        if (!loaded && ui.el.resultCount) {
            ui.el.resultCount.innerText = "読込エラー";
        }
    }

    return {
        loadInitialData
    };
}
