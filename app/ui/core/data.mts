import { getDateUiState, getSearchUiState } from "../../lib/ui-slices.mjs";
import type { AppUiState } from "../../state.types";

/** @typedef {import("../../state.types").AppUiState} AppUiState */

type DataLoaderDataState = {
    allSongsRaw: Song[];
};

type DataSourceLoadResult = {
    songs: Song[];
    source: string;
    resetConditions?: boolean;
};

type DataLoaderInput = {
    data: DataLoaderDataState;
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
 * @param {{
 *   data: { allSongsRaw: Song[] },
 *   ui: AppUiState,
 *   dataSource: {
 *     loadInitialSongs: (callbacks: { onSongsLoaded: (result: { songs: Song[], source: string, resetConditions?: boolean }) => void }) => Promise<boolean>
 *   },
 *   callbacks: {
 *     migrateLegacyBookmarkSongRefs: () => void,
 *     applyDateInputRange: (songs: Song[]) => { minKey: number, maxKey: number } | null,
 *     clampDateInputsToBounds: (minKey: number, maxKey: number) => void,
 *     resetSearchConditions: (shouldSearch: boolean) => void,
 *     scheduleSearch: (options?: { immediate?: boolean }) => void
 *   }
 * }} input
 */
export function createDataLoader(input: DataLoaderInput) {
    const {
        data,
        ui,
        dataSource,
        callbacks
    } = input;
    const searchUiState = getSearchUiState(ui);
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
