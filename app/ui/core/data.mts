import type { AppDataState, AppUiState } from "../../state.types";
import type { SongsSnapshot } from "../../lib/songs-data-source.mjs";

export type InitialDataLoadResult =
    | { loaded: false }
    | { loaded: true; shouldResetConditions: boolean };

type DataLoaderInput = {
    data: Pick<AppDataState, "allSongsRaw">;
    ui: AppUiState;
    dataSource: {
        loadInitialSnapshot: () => Promise<SongsSnapshot | null>;
    };
    callbacks: {
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
        callbacks
    } = input;
    const searchUiState = ui.search;
    const dateUi = ui.date;
    const {
        applyDateInputRange,
        clampDateInputsToBounds
    } = callbacks;

    /**
     * 曲配列を状態と曲データ由来のUIへ反映する。
     * @param {Song[]} songs
     * @param {string | null} statusLabel
     */
    function applyLoadedSongs(
        songs: Song[],
        statusLabel: string | null
    ): void {
        data.allSongsRaw = songs;
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
    }

    /**
     * 初期スナップショットを状態へ反映する。
     * @param snapshot 初期表示に使う曲データ
     */
    function applyInitialSnapshot(snapshot: SongsSnapshot): void {
        const statusLabel = snapshot.source === "cache" ? "キャッシュを表示中" : null;
        applyLoadedSongs(snapshot.songs, statusLabel);
    }

    /** 初期データの取得・検証完了後に、曲データと検索UIを有効にする。 */
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
        return { loaded: true, shouldResetConditions };
    }

    return {
        loadInitialData
    };
}
