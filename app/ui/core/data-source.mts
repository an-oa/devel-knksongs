import {
    createIndexedDbSongsJsonCacheStore,
    createIndexedDbTextCacheStore,
    createLegacyLocalStorageSongsJsonCacheAdapter,
    createLegacyLocalStorageTextCacheAdapter
} from "../../lib/storage/songs-json-cache.mjs";
import { createSongsDataSource } from "../../lib/songs-data-source.mjs";

type BrowserSongsDataSourceInput = {
    publicSongsJsonUrl: string;
    publicSongsMetaUrl: string;
    publicCsvUrl: string;
    songsJsonCacheKey: string;
    obsoleteCsvCacheKey: string;
    obsoleteLegacyCsvCacheKey: string;
};

/**
 * ブラウザの localStorage を安全に取得する。
 * @returns {Storage | null}
 */
function getBrowserLocalStorage(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch (error) {
        console.warn("localStorageを参照できませんでした", error);
        return null;
    }
}

/**
 * ブラウザ保存領域を使う曲データ取得元を作成する。
 * JSONはIndexedDBを主キャッシュとして使い、廃止済みCSVキャッシュは初期化時に削除する。
 */
export function createBrowserSongsDataSource(input: BrowserSongsDataSourceInput) {
    const {
        publicSongsJsonUrl,
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCacheKey,
        obsoleteCsvCacheKey,
        obsoleteLegacyCsvCacheKey
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
    const obsoleteCsvCacheStore = createIndexedDbTextCacheStore({
        cacheKey: obsoleteCsvCacheKey
    });
    const obsoleteCsvCache = createLegacyLocalStorageTextCacheAdapter({
        cache: obsoleteCsvCacheStore,
        legacyKeys: [obsoleteCsvCacheKey, obsoleteLegacyCsvCacheKey],
        storage: browserStorage,
        label: "CSVキャッシュ"
    });
    void obsoleteCsvCache.removeText();

    return createSongsDataSource({
        publicSongsJsonUrl,
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCache
    });
}
