import type { AppDataState, AppUiState } from "../../state.types";
import { reconcileRecommendedSearchCache } from "../../lib/search-recommendation.mjs";
import type { SongsSnapshot } from "../../lib/songs-data-source.mjs";

type ApplyLoadedSongsOptions = {
    clearRecommendedCache?: boolean;
};

export type InitialDataLoadResult =
    | { loaded: false }
    | { loaded: true; shouldResetConditions: boolean };

type DataLoaderInput = {
    data: Pick<AppDataState, "allSongsRaw" | "pendingSongsRaw">;
    ui: AppUiState;
    constants: {
        minPerformanceCount: number;
    };
    dataSource: {
        loadInitialSnapshot: () => Promise<SongsSnapshot | null>;
        refreshSnapshot: (reference: SongsSnapshot) => Promise<SongsSnapshot | null>;
    };
    callbacks: {
        migrateLegacyBookmarkSongRefs: () => void;
        applyDateInputRange: (songs: Song[]) => SearchDateRange | null;
        clampDateInputsToBounds: (minKey: number, maxKey: number) => void;
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
        clampDateInputsToBounds
    } = callbacks;

    /**
     * 曲配列を状態と曲データ由来のUIへ反映する。
     * @param {Song[]} songs
     * @param {string | null} statusLabel
     * @param options おすすめキャッシュの更新方法
     */
    function applyLoadedSongs(
        songs: Song[],
        statusLabel: string | null,
        options: ApplyLoadedSongsOptions = {}
    ): void {
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
    }

    /**
     * 初期スナップショットを状態へ反映する。
     * @param snapshot 初期表示に使う曲データ
     */
    function applyInitialSnapshot(snapshot: SongsSnapshot): void {
        data.pendingSongsRaw = null;
        const statusLabel = snapshot.source === "cache" ? "キャッシュを表示中" : null;
        applyLoadedSongs(snapshot.songs, statusLabel);
    }

    /**
     * キャッシュ表示後の更新結果を、次回検索まで保留する。
     * 初期データ読込の完了はこの通信を待たない。
     * @param reference 初期表示に使ったスナップショット
     */
    function stageSnapshotRefresh(reference: SongsSnapshot): void {
        void dataSource.refreshSnapshot(reference).then((snapshot) => {
            if (snapshot) data.pendingSongsRaw = snapshot.songs;
        }).catch((error) => {
            console.warn("最新の曲データを確認できませんでした", error);
        });
    }

    /**
     * バックグラウンド取得した最新曲データを次の検索処理へ同期的に反映する。
     * 表示更新は呼び出し元の検索処理へ任せ、追加の検索予約は行わない。
     * @returns 保留データを反映したか
     */
    function commitPendingSnapshot(): boolean {
        const pendingSongs = data.pendingSongsRaw;
        if (!pendingSongs) return false;
        data.pendingSongsRaw = null;
        applyLoadedSongs(pendingSongs, null, {
            clearRecommendedCache: false
        });
        return true;
    }

    /**
     * 初期スナップショットを取得して適用し、キャッシュなら更新確認だけをバックグラウンドで開始する。
     * @returns 読込成否と、呼び出し元が検索条件を初期化すべきか
     */
    async function loadInitialData(): Promise<InitialDataLoadResult> {
        if (ui.el.resultCount) ui.el.resultCount.innerText = "データを読み込み中...";
        const snapshot = await dataSource.loadInitialSnapshot();
        if (!snapshot) {
            if (ui.el.resultCount) ui.el.resultCount.innerText = "読込エラー";
            return { loaded: false };
        }
        const shouldResetConditions = !searchUiState.dataReady &&
            !searchUiState.hasRestoredSearchState &&
            !dateUi.pendingValues;
        applyInitialSnapshot(snapshot);
        if (snapshot.source === "cache") {
            stageSnapshotRefresh(snapshot);
        }
        return { loaded: true, shouldResetConditions };
    }

    return {
        loadInitialData,
        commitPendingSnapshot
    };
}
