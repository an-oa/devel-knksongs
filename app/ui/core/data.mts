import type { AppDataState, AppUiState } from "../../state.types";
import type { SongsSnapshot } from "../../lib/songs-data-source.mjs";
import { getUiText } from "../../lib/ui-text.mjs";

export type InitialDataLoadResult =
    | { loaded: false }
    | { loaded: true; shouldResetConditions: boolean };

type DataLoaderInput = {
    data: Pick<AppDataState, "allSongsRaw">;
    ui: {
        el: Pick<AppUiState["el"], "resultCount" | "searchBox">;
        /** 読み込み中とエラーの表示の言語。省略時は日本語にする。 */
        language?: AppUiState["language"];
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
        const results = getUiText(ui.language?.current ?? "ja").results;
        if (ui.el.resultCount) ui.el.resultCount.innerText = results.loadingData;
        const snapshot = await dataSource.loadInitialSnapshot();
        if (!snapshot) {
            if (ui.el.resultCount) ui.el.resultCount.innerText = results.loadError;
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
