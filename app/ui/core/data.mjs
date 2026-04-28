import { parseCsvToSongs } from "../../lib/csv-parser.mjs?v=13";
import { parseSongsJsonPayload } from "../../lib/songs-json.mjs?v=13";
import { getDateUiState, getSearchUiState } from "../../lib/ui-slices.mjs?v=13";

/**
 * 曲データの読込と初期データ反映を扱うコントローラーを作成する。
 * @param {{
 *   data: { allSongsRaw: unknown[] },
 *   ui: { el: Record<string, HTMLElement | null>, recommendedCache: unknown, dataReady: boolean, hasRestoredSearchState: boolean },
 *   publicSongsJsonUrl?: string,
 *   publicCsvUrl: string,
 *   songsJsonCacheKey?: string,
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
        publicSongsJsonUrl,
        publicCsvUrl,
        songsJsonCacheKey,
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
     * localStorage から文字列を安全に読み込む。
     * @param {string | undefined} key
     * @returns {string | null}
     */
    function getCachedText(key) {
        if (!key) return null;
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.warn(`localStorageを読み込めませんでした: ${key}`, error);
            return null;
        }
    }

    /**
     * localStorage へ文字列を安全に保存する。
     * @param {string | undefined} key
     * @param {string} value
     * @returns {boolean}
     */
    function setCachedText(key, value) {
        if (!key) return false;
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.warn(`localStorageへ保存できませんでした: ${key}`, error);
            return false;
        }
    }

    /**
     * localStorage のキャッシュを安全に削除する。
     * @param {string | undefined} key
     */
    function removeCachedText(key) {
        if (!key) return;
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`localStorageから削除できませんでした: ${key}`, error);
        }
    }

    /**
     * 曲データJSONを取得する。
     * @returns {Promise<string>}
     */
    async function fetchSongsJsonText() {
        const response = await fetch(publicSongsJsonUrl, { cache: "no-cache" });
        if (!response.ok) throw new Error("json fetch failed");
        return response.text();
    }

    /**
     * CSV を取得する。
     * @returns {Promise<string>}
     */
    async function fetchCsvText() {
        const response = await fetch(publicCsvUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("fetch failed");
        return response.text();
    }

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
     * 読み込んだ CSV を解析して状態更新と初回検索を行う。
     * @param {string} csvText
     * @param {string | null} statusLabel
     */
    function applyLoadedCsv(csvText, statusLabel) {
        applyLoadedSongs(parseCsvToSongs(csvText), statusLabel);
    }

    /**
     * JSON取得失敗後にCSV取得またはCSVキャッシュで初期データを適用する。
     */
    async function loadCsvFallback() {
        try {
            const csvText = await fetchCsvText();
            setCachedText(csvCacheKey, csvText);
            applyLoadedCsv(csvText, null);
        } catch (error) {
            const cached = getCachedText(csvCacheKey);
            if (cached) {
                applyLoadedCsv(cached, "キャッシュを表示中");
                return;
            }
            if (ui.el.resultCount) ui.el.resultCount.innerText = "読込エラー";
        }
    }

    /**
     * キャッシュ表示後にバックグラウンドでJSONを更新する。
     * @param {string} cachedJson
     */
    async function refreshSongsJsonCache(cachedJson) {
        try {
            const jsonText = await fetchSongsJsonText();
            if (jsonText === cachedJson) return;
            const songs = parseSongsJsonPayload(jsonText);
            if (setCachedText(songsJsonCacheKey, jsonText)) {
                removeCachedText(csvCacheKey);
            }
            applyLoadedSongs(songs, null, { resetConditions: false });
        } catch (error) {
            console.warn("曲データJSONの更新に失敗しました", error);
        }
    }

    /**
     * JSONを優先して読み込み、失敗時はCSV経路へフォールバックする。
     */
    async function loadJsonOrCsvData() {
        const cachedJson = getCachedText(songsJsonCacheKey);
        if (cachedJson) {
            try {
                applyLoadedSongs(parseSongsJsonPayload(cachedJson), "キャッシュを表示中");
                refreshSongsJsonCache(cachedJson);
                return;
            } catch (error) {
                console.warn("曲データJSONキャッシュを読み込めませんでした", error);
                removeCachedText(songsJsonCacheKey);
            }
        }

        try {
            const jsonText = await fetchSongsJsonText();
            const songs = parseSongsJsonPayload(jsonText);
            if (setCachedText(songsJsonCacheKey, jsonText)) {
                removeCachedText(csvCacheKey);
            }
            applyLoadedSongs(songs, null);
        } catch (error) {
            await loadCsvFallback();
        }
    }

    /**
     * 曲データを取得し、失敗時はキャッシュやCSV経路を利用して初期データを適用する。
     */
    async function loadInitialData() {
        if (ui.el.resultCount) ui.el.resultCount.innerText = "データを読み込み中...";
        if (publicSongsJsonUrl && songsJsonCacheKey) {
            await loadJsonOrCsvData();
            return;
        }
        await loadCsvFallback();
    }

    return {
        loadInitialData
    };
}
