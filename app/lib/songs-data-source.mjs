import { parseCsvToSongs } from "./csv-parser.mjs?v=20";
import { parseSongsJsonMetaPayload, parseSongsJsonPayload } from "./songs-json.mjs?v=20";

/**
 * localStorage から文字列を安全に読み込む。
 * @param {{ getItem: (key: string) => string | null } | null | undefined} storage
 * @param {string | undefined} key
 * @returns {string | null}
 */
function getCachedText(storage, key) {
    if (!storage || !key) return null;
    try {
        return storage.getItem(key);
    } catch (error) {
        console.warn(`localStorageを読み込めませんでした: ${key}`, error);
        return null;
    }
}

/**
 * localStorage へ文字列を安全に保存する。
 * @param {{ setItem: (key: string, value: string) => void } | null | undefined} storage
 * @param {string | undefined} key
 * @param {string} value
 * @returns {boolean}
 */
function setCachedText(storage, key, value) {
    if (!storage || !key) return false;
    try {
        storage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn(`localStorageへ保存できませんでした: ${key}`, error);
        return false;
    }
}

/**
 * localStorage のキャッシュを安全に削除する。
 * @param {{ removeItem: (key: string) => void } | null | undefined} storage
 * @param {string | undefined} key
 */
function removeCachedText(storage, key) {
    if (!storage || !key) return;
    try {
        storage.removeItem(key);
    } catch (error) {
        console.warn(`localStorageから削除できませんでした: ${key}`, error);
    }
}

/**
 * 曲データの取得元とキャッシュ更新を扱う data source を作成する。
 * @param {{
 *   publicSongsJsonUrl?: string,
 *   publicSongsMetaUrl?: string,
 *   publicCsvUrl: string,
 *   songsJsonCache?: {
 *     getText: () => Promise<string | null>,
 *     setText: (value: string) => Promise<boolean>,
 *     removeText: () => Promise<void>
 *   },
 *   storage?: {
 *     getItem: (key: string) => string | null,
 *     setItem: (key: string, value: string) => void,
 *     removeItem: (key: string) => void
 *   } | null,
 *   csvCacheKey: string
 * }} input
 */
export function createSongsDataSource(input) {
    const {
        publicSongsJsonUrl,
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCache,
        storage = null,
        csvCacheKey
    } = input;

    /**
     * 非同期ストアから曲データJSONキャッシュを読み込む。
     * @returns {Promise<string | null>}
     */
    async function getCachedSongsJsonText() {
        if (!songsJsonCache) return null;
        try {
            return await songsJsonCache.getText();
        } catch (error) {
            console.warn("曲データJSONキャッシュを読み込めませんでした", error);
            return null;
        }
    }

    /**
     * 非同期ストアへ曲データJSONキャッシュを保存する。
     * @param {string} jsonText
     * @returns {Promise<boolean>}
     */
    async function setCachedSongsJsonText(jsonText) {
        if (!songsJsonCache) return false;
        try {
            return await songsJsonCache.setText(jsonText);
        } catch (error) {
            console.warn("曲データJSONキャッシュを保存できませんでした", error);
            return false;
        }
    }

    /**
     * 非同期ストアから曲データJSONキャッシュを削除する。
     * @returns {Promise<void>}
     */
    async function removeCachedSongsJsonText() {
        if (!songsJsonCache) return;
        try {
            await songsJsonCache.removeText();
        } catch (error) {
            console.warn("曲データJSONキャッシュを削除できませんでした", error);
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
     * JSON取得失敗後にCSV取得またはCSVキャッシュで初期データを返す。
     * @param {(result: { songs: unknown[], source: string, resetConditions?: boolean }) => void} onSongsLoaded
     * @returns {Promise<boolean>}
     */
    async function loadCsvFallback(onSongsLoaded) {
        try {
            const csvText = await fetchCsvText();
            setCachedText(storage, csvCacheKey, csvText);
            onSongsLoaded({ songs: parseCsvToSongs(csvText), source: "network" });
            return true;
        } catch (error) {
            const cached = getCachedText(storage, csvCacheKey);
            if (cached) {
                onSongsLoaded({ songs: parseCsvToSongs(cached), source: "cache" });
                return true;
            }
            return false;
        }
    }

    /**
     * 曲データJSONをネットワークから読み込み、キャッシュと画面表示へ反映する。
     * @param {(result: { songs: unknown[], source: string, resetConditions?: boolean }) => void} onSongsLoaded
     * @returns {Promise<boolean>}
     */
    async function loadNetworkSongsJson(onSongsLoaded) {
        const jsonText = await fetchSongsJsonText();
        const payload = parseSongsJsonPayload(jsonText);
        if (await setCachedSongsJsonText(jsonText)) {
            removeCachedText(storage, csvCacheKey);
        }
        onSongsLoaded({ songs: payload.songs, source: "network" });
        return true;
    }

    /**
     * CSV fallback を試し、失敗時は最後に JSON キャッシュを表示する。
     * @param {{ contentHash: string, songs: unknown[] }} cachedPayload
     * @param {(result: { songs: unknown[], source: string, resetConditions?: boolean }) => void} onSongsLoaded
     * @returns {Promise<boolean>}
     */
    async function loadCsvOrCachedSongsJson(cachedPayload, onSongsLoaded) {
        if (await loadCsvFallback(onSongsLoaded)) return true;
        onSongsLoaded({ songs: cachedPayload.songs, source: "cache" });
        return true;
    }

    /**
     * キャッシュ済みJSONの鮮度を meta で確認し、表示すべきデータを決める。
     * meta を確認できない場合や、新しい JSON / CSV を取得できない場合はキャッシュを表示する。
     * @param {{ contentHash: string, songs: unknown[] }} cachedPayload
     * @param {(result: { songs: unknown[], source: string, resetConditions?: boolean }) => void} onSongsLoaded
     * @returns {Promise<boolean>}
     */
    async function loadFromValidatedSongsJsonCache(cachedPayload, onSongsLoaded) {
        if (!publicSongsMetaUrl) {
            onSongsLoaded({ songs: cachedPayload.songs, source: "cache" });
            return true;
        }

        try {
            const meta = parseSongsJsonMetaPayload(await fetchSongsMetaText());
            if (meta.contentHash === cachedPayload.contentHash) {
                onSongsLoaded({ songs: cachedPayload.songs, source: "cache" });
                return true;
            }
        } catch (error) {
            console.warn("曲データJSONメタ情報の確認に失敗しました", error);
            onSongsLoaded({ songs: cachedPayload.songs, source: "cache" });
            return true;
        }

        try {
            return await loadNetworkSongsJson(onSongsLoaded);
        } catch (error) {
            return loadCsvOrCachedSongsJson(cachedPayload, onSongsLoaded);
        }
    }

    /**
     * JSONを優先して読み込み、失敗時はCSV経路へフォールバックする。
     * @param {(result: { songs: unknown[], source: string, resetConditions?: boolean }) => void} onSongsLoaded
     * @returns {Promise<boolean>}
     */
    async function loadJsonOrCsvData(onSongsLoaded) {
        const cachedJson = await getCachedSongsJsonText();
        if (cachedJson) {
            try {
                const cachedPayload = parseSongsJsonPayload(cachedJson);
                return await loadFromValidatedSongsJsonCache(cachedPayload, onSongsLoaded);
            } catch (error) {
                console.warn("曲データJSONキャッシュを読み込めませんでした", error);
                await removeCachedSongsJsonText();
            }
        }

        try {
            return await loadNetworkSongsJson(onSongsLoaded);
        } catch (error) {
            return loadCsvFallback(onSongsLoaded);
        }
    }

    /**
     * 曲データを取得し、取得できた場合は callback へ曲配列を渡す。
     * @param {{ onSongsLoaded: (result: { songs: unknown[], source: string, resetConditions?: boolean }) => void }} callbacks
     * @returns {Promise<boolean>}
     */
    async function loadInitialSongs(callbacks) {
        const { onSongsLoaded } = callbacks;
        if (publicSongsJsonUrl && songsJsonCache) {
            return loadJsonOrCsvData(onSongsLoaded);
        }
        return loadCsvFallback(onSongsLoaded);
    }

    return {
        loadInitialSongs
    };
}
