import { parseCsvToSongs } from "../../lib/csv-parser.mjs?v=13";
import { parseSongsJsonMetaPayload, parseSongsJsonPayload } from "../../lib/songs-json.mjs?v=13";
import { getDateUiState, getSearchUiState } from "../../lib/ui-slices.mjs?v=13";

/**
 * 曲データの読込と初期データ反映を扱うコントローラーを作成する。
 * @param {{
 *   data: { allSongsRaw: unknown[] },
 *   ui: { el: Record<string, HTMLElement | null>, recommendedCache: unknown, dataReady: boolean, hasRestoredSearchState: boolean },
 *   publicSongsJsonUrl?: string,
 *   publicSongsMetaUrl?: string,
 *   publicCsvUrl: string,
 *   songsJsonCache?: {
 *     getText: () => Promise<string | null>,
 *     setText: (value: string) => Promise<boolean>,
 *     removeText: () => Promise<void>
 *   },
 *   legacySongsJsonCacheKey?: string,
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
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCache,
        legacySongsJsonCacheKey,
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
     * IndexedDB などの非同期ストアから曲データJSONキャッシュを読み込む。
     * @returns {Promise<string | null>}
     */
    async function getCachedSongsJsonText() {
        if (!songsJsonCache) return null;
        try {
            const cachedJson = await songsJsonCache.getText();
            if (cachedJson) return cachedJson;
        } catch (error) {
            console.warn("曲データJSONキャッシュを読み込めませんでした", error);
        }
        const legacyCachedJson = getCachedText(legacySongsJsonCacheKey);
        if (!legacyCachedJson) return null;
        if (await setCachedSongsJsonText(legacyCachedJson)) {
            removeCachedText(legacySongsJsonCacheKey);
        }
        return legacyCachedJson;
    }

    /**
     * IndexedDB などの非同期ストアへ曲データJSONキャッシュを保存する。
     * @param {string} jsonText
     * @returns {Promise<boolean>}
     */
    async function setCachedSongsJsonText(jsonText) {
        if (!songsJsonCache) return false;
        try {
            return await songsJsonCache.setText(jsonText);
        } catch (error) {
            console.warn("曲データJSONキャッシュを保存できませんでした", error);
            if (getCachedText(legacySongsJsonCacheKey)) {
                removeCachedText(legacySongsJsonCacheKey);
                try {
                    return await songsJsonCache.setText(jsonText);
                } catch (retryError) {
                    console.warn("曲データJSONキャッシュの再保存に失敗しました", retryError);
                }
            }
            return false;
        }
    }

    /**
     * IndexedDB などの非同期ストアから曲データJSONキャッシュを削除する。
     * @returns {Promise<void>}
     */
    async function removeCachedSongsJsonText() {
        if (!songsJsonCache) return;
        try {
            await songsJsonCache.removeText();
        } catch (error) {
            console.warn("曲データJSONキャッシュを削除できませんでした", error);
        }
        removeCachedText(legacySongsJsonCacheKey);
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
     * 曲データJSONのメタ情報を取得する。
     * @returns {Promise<string>}
     */
    async function fetchSongsMetaText() {
        const response = await fetch(publicSongsMetaUrl, { cache: "no-cache" });
        if (!response.ok) throw new Error("json meta fetch failed");
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
     * @param {{ contentHash: string, songs: unknown[] }} cachedPayload
     */
    async function refreshSongsJsonCache(cachedPayload) {
        try {
            if (publicSongsMetaUrl) {
                try {
                    const meta = parseSongsJsonMetaPayload(await fetchSongsMetaText());
                    if (meta.contentHash === cachedPayload.contentHash) return;
                } catch (error) {
                    console.warn("曲データJSONメタ情報の確認に失敗しました", error);
                }
            }
            const jsonText = await fetchSongsJsonText();
            const payload = parseSongsJsonPayload(jsonText);
            if (payload.contentHash === cachedPayload.contentHash) return;
            if (await setCachedSongsJsonText(jsonText)) {
                removeCachedText(csvCacheKey);
            }
            applyLoadedSongs(payload.songs, null, { resetConditions: false });
        } catch (error) {
            console.warn("曲データJSONの更新に失敗しました", error);
        }
    }

    /**
     * JSONを優先して読み込み、失敗時はCSV経路へフォールバックする。
     */
    async function loadJsonOrCsvData() {
        const cachedJson = await getCachedSongsJsonText();
        if (cachedJson) {
            try {
                const cachedPayload = parseSongsJsonPayload(cachedJson);
                applyLoadedSongs(cachedPayload.songs, "キャッシュを表示中");
                refreshSongsJsonCache(cachedPayload);
                return;
            } catch (error) {
                console.warn("曲データJSONキャッシュを読み込めませんでした", error);
                await removeCachedSongsJsonText();
            }
        }

        try {
            const jsonText = await fetchSongsJsonText();
            const payload = parseSongsJsonPayload(jsonText);
            if (await setCachedSongsJsonText(jsonText)) {
                removeCachedText(csvCacheKey);
            }
            applyLoadedSongs(payload.songs, null);
        } catch (error) {
            await loadCsvFallback();
        }
    }

    /**
     * 曲データを取得し、失敗時はキャッシュやCSV経路を利用して初期データを適用する。
     */
    async function loadInitialData() {
        if (ui.el.resultCount) ui.el.resultCount.innerText = "データを読み込み中...";
        if (publicSongsJsonUrl && songsJsonCache) {
            await loadJsonOrCsvData();
            return;
        }
        await loadCsvFallback();
    }

    return {
        loadInitialData
    };
}
