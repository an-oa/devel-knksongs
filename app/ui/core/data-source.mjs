import {
    createIndexedDbSongsJsonCacheStore,
    createLegacyLocalStorageSongsJsonCacheAdapter
} from "../../lib/storage/songs-json-cache.mjs?v=26";
import { createSongsDataSource } from "../../lib/songs-data-source.mjs?v=26";

/**
 * @typedef {{
 *   publicSongsJsonUrl: string,
 *   publicSongsMetaUrl: string,
 *   publicCsvUrl: string,
 *   songsJsonCacheKey: string,
 *   csvCacheKey: string,
 *   legacyCsvCacheKey: string
 * }} BrowserSongsDataSourceInput
 */

/**
 * ブラウザの localStorage を安全に取得する。
 * @returns {Storage | null}
 */
function getBrowserLocalStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch (error) {
        console.warn("localStorageを参照できませんでした", error);
        return null;
    }
}

/**
 * ブラウザ保存領域を使う曲データ取得元を作成する。
 * IndexedDB を主キャッシュ、旧 localStorage JSON を移行元として束ねる。
 * @param {BrowserSongsDataSourceInput} input
 * @returns {CacheBusterSongsDataSource}
 */
export function createBrowserSongsDataSource(input) {
    const {
        publicSongsJsonUrl,
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCacheKey,
        csvCacheKey,
        legacyCsvCacheKey
    } = input;
    const browserStorage = getBrowserLocalStorage();
    const songsJsonCacheStore = createIndexedDbSongsJsonCacheStore({
        cacheKey: songsJsonCacheKey
    });
    const songsJsonCache = createLegacyLocalStorageSongsJsonCacheAdapter({
        cache: songsJsonCacheStore,
        legacyKey: songsJsonCacheKey,
        storage: browserStorage
    });

    return createSongsDataSource({
        publicSongsJsonUrl,
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCache,
        storage: browserStorage,
        csvCacheKey,
        legacyCsvCacheKeys: [legacyCsvCacheKey]
    });
}
