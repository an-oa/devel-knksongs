import { parseCsvToSongs } from "../../lib/csv-parser.mjs?v=11";
import { getDateUiState, getSearchUiState } from "../../lib/ui-slices.mjs?v=11";

/**
 * CSV 読込と初期データ反映を扱うコントローラーを作成する。
 * @param {{
 *   data: { allSongsRaw: unknown[] },
 *   ui: { el: Record<string, HTMLElement | null>, recommendedCache: unknown, dataReady: boolean, hasRestoredSearchState: boolean },
 *   publicCsvUrl: string,
 *   csvCacheKey: string,
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
        publicCsvUrl,
        csvCacheKey,
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
     * CSV を取得し、失敗時はキャッシュを利用して初期データを適用する。
     */
    async function loadInitialData() {
        const resultCount = ui.el.resultCount;
        try {
            if (resultCount) resultCount.innerText = "データを読み込み中...";
            const response = await fetch(publicCsvUrl, { cache: "no-store" });
            if (!response.ok) throw new Error("fetch failed");
            const csvText = await response.text();
            localStorage.setItem(csvCacheKey, csvText);
            applyLoadedCsv(csvText, null);
        } catch (error) {
            const cached = localStorage.getItem(csvCacheKey);
            if (cached) {
                applyLoadedCsv(cached, "キャッシュを表示中");
                return;
            }
            if (resultCount) resultCount.innerText = "読込エラー";
        }
    }

    /**
     * 読み込んだ CSV を解析して状態更新と初回検索を行う。
     * @param {string} csvText
     * @param {string | null} statusLabel
     */
    function applyLoadedCsv(csvText, statusLabel) {
        data.allSongsRaw = parseCsvToSongs(csvText);
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
        if (!searchUi.hasRestoredSearchState && !dateUi.pendingValues) {
            resetSearchConditions(false);
        }
        scheduleSearch({ immediate: true });
    }

    return {
        loadInitialData
    };
}
