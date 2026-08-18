import type { AppDataState, AppUiState } from "../../state.types";
import { reconcileRecommendedSearchCache } from "../../lib/search-recommendation.mjs";

type DataSourceLoadResult = {
    songs: Song[];
    source: string;
    resetConditions?: boolean;
    isBackgroundRefresh?: boolean;
};

type ApplyLoadedSongsOptions = {
    resetConditions?: boolean;
    clearRecommendedCache?: boolean;
    scheduleSearch?: boolean;
};

type DataLoaderInput = {
    data: Pick<AppDataState, "allSongsRaw" | "pendingSongsRaw">;
    ui: AppUiState;
    constants: {
        minPerformanceCount: number;
    };
    dataSource: {
        loadInitialSongs: (callbacks: {
            onSongsLoaded: (result: DataSourceLoadResult) => void;
        }) => Promise<boolean>;
    };
    callbacks: {
        migrateLegacyBookmarkSongRefs: () => void;
        applyDateInputRange: (songs: Song[]) => SearchDateRange | null;
        clampDateInputsToBounds: (minKey: number, maxKey: number) => void;
        resetSearchConditions: (shouldSearch: boolean) => void;
        scheduleSearch: (options?: { immediate?: boolean }) => void;
    };
};

/**
 * 曲データの読込と初期データ反映を扱うコントローラーを作成する。
 */
export function createDataLoader(input: DataLoaderInput) {
    const {
        data,
        ui,
        dataSource,
        constants,
        callbacks
    } = input;
    const searchUiState = ui.search;
    const dateUi = ui.date;
    const {
        migrateLegacyBookmarkSongRefs,
        applyDateInputRange,
        clampDateInputsToBounds,
        resetSearchConditions,
        scheduleSearch
    } = callbacks;

    /**
     * 曲配列を状態へ反映して初回検索を行う。
     * @param {Song[]} songs
     * @param {string | null} statusLabel
     * @param options 初期化・検索実行方法
     */
    function applyLoadedSongs(
        songs: Song[],
        statusLabel: string | null,
        options: ApplyLoadedSongsOptions = {}
    ): void {
        const shouldResetConditions = typeof options.resetConditions === "boolean"
            ? options.resetConditions
            : !searchUiState.dataReady;
        data.allSongsRaw = songs;
        migrateLegacyBookmarkSongRefs();
        if (options.clearRecommendedCache === false) {
            searchUiState.recommendedCache = reconcileRecommendedSearchCache(
                songs,
                searchUiState.recommendedCache,
                { minPerformanceCount: constants.minPerformanceCount }
            );
        } else {
            searchUiState.recommendedCache = null;
        }
        const dateBounds = applyDateInputRange(data.allSongsRaw);
        if (dateBounds) {
            clampDateInputsToBounds(dateBounds.minKey, dateBounds.maxKey);
        }
        if (ui.el.searchBox) ui.el.searchBox.disabled = false;
        searchUiState.dataReady = true;
        if (statusLabel && ui.el.resultCount) {
            ui.el.resultCount.innerText = statusLabel;
        }
        if (shouldResetConditions && !searchUiState.hasRestoredSearchState && !dateUi.pendingValues) {
            resetSearchConditions(false);
        }
        if (options.scheduleSearch !== false) {
            scheduleSearch({ immediate: true });
        }
    }

    /**
     * data source から受け取った曲配列を状態へ反映する。
     * @param {{ songs: Song[], source: string, resetConditions?: boolean }} result
     */
    function applyDataSourceResult(result: DataSourceLoadResult): void {
        if (result.isBackgroundRefresh && searchUiState.dataReady) {
            data.pendingSongsRaw = result.songs;
            return;
        }
        data.pendingSongsRaw = null;
        const statusLabel = result.source === "cache" ? "キャッシュを表示中" : null;
        applyLoadedSongs(result.songs, statusLabel, { resetConditions: result.resetConditions });
    }

    /**
     * バックグラウンド取得した最新曲データを次の検索処理へ同期的に反映する。
     * 表示更新は呼び出し元の検索処理へ任せ、追加の検索予約は行わない。
     * @returns 保留データを反映したか
     */
    function applyPendingSongs(): boolean {
        const pendingSongs = data.pendingSongsRaw;
        if (!pendingSongs) return false;
        data.pendingSongsRaw = null;
        applyLoadedSongs(pendingSongs, null, {
            resetConditions: false,
            clearRecommendedCache: false,
            scheduleSearch: false
        });
        return true;
    }

    /**
     * 曲データを取得し、取得成功時は初期データとして適用する。
     */
    async function loadInitialData(): Promise<void> {
        if (ui.el.resultCount) ui.el.resultCount.innerText = "データを読み込み中...";
        const loaded = await dataSource.loadInitialSongs({
            onSongsLoaded: applyDataSourceResult
        });
        if (!loaded && ui.el.resultCount) {
            ui.el.resultCount.innerText = "読込エラー";
        }
    }

    return {
        loadInitialData,
        applyPendingSongs
    };
}
