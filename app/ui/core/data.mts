import type { AppDataState, AppUiState } from "../../state.types";

type DataSourceLoadResult = {
    songs: Song[];
    source: string;
    resetConditions?: boolean;
};

type DataLoaderInput = {
    data: Pick<AppDataState, "allSongsRaw">;
    ui: AppUiState;
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
     * @param {{ resetConditions?: boolean } | undefined} options
     */
    function applyLoadedSongs(
        songs: Song[],
        statusLabel: string | null,
        options?: { resetConditions?: boolean }
    ): void {
        const shouldResetConditions = options && typeof options.resetConditions === "boolean"
            ? options.resetConditions
            : !searchUiState.dataReady;
        data.allSongsRaw = songs;
        migrateLegacyBookmarkSongRefs();
        searchUiState.recommendedCache = null;
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
        scheduleSearch({ immediate: true });
    }

    /**
     * data source から受け取った曲配列を状態へ反映する。
     * @param {{ songs: Song[], source: string, resetConditions?: boolean }} result
     */
    function applyDataSourceResult(result: DataSourceLoadResult): void {
        const statusLabel = result.source === "cache" ? "キャッシュを表示中" : null;
        applyLoadedSongs(result.songs, statusLabel, { resetConditions: result.resetConditions });
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
        loadInitialData
    };
}
