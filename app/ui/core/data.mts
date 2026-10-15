import type { AppDataState, AppUiState } from "../../state.types";
import type { SongsSnapshot } from "../../lib/songs-data-source.mjs";

export type InitialDataLoadResult =
    | { loaded: false }
    | { loaded: true; shouldResetConditions: boolean };

type DataLoaderInput = {
    data: Pick<AppDataState, "allSongsRaw">;
    ui: {
        el: Pick<AppUiState["el"], "resultCount" | "searchBox">;
        search: Pick<AppUiState["search"], "recommendedCache" | "dataReady" | "hasRestoredSearchState">;
        date: Pick<AppUiState["date"], "pendingValues">;
    };
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
     * 件数表示は、この直後に行う検索が結果で書き換える。
     * @param songs 読み込んだ曲データ
     */
    function applyLoadedSongs(songs: Song[]): void {
        data.allSongsRaw = songs;
        searchUiState.recommendedCache = null;
        const dateBounds = applyDateInputRange(data.allSongsRaw);
        if (dateBounds) {
            clampDateInputsToBounds(dateBounds.minKey, dateBounds.maxKey);
        }
        if (ui.el.searchBox) ui.el.searchBox.disabled = false;
        searchUiState.dataReady = true;
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
        applyLoadedSongs(snapshot.songs);
        return { loaded: true, shouldResetConditions };
    }

    return {
        loadInitialData
    };
}
