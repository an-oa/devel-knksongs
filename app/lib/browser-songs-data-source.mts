import {
    createIndexedDbSongsJsonCacheStore,
    createIndexedDbTextCacheStore,
    createLegacyLocalStorageSongsJsonCacheAdapter,
    createLegacyLocalStorageTextCacheAdapter
} from "./storage/songs-json-cache.mjs";
import { getBrowserLocalStorage } from "./storage/local-storage-text.mjs";
import { createSongsDataSource } from "./songs-data-source.mjs";

type BrowserSongsDataSourceInput = {
    publicSongsJsonUrl: string;
    publicSongsMetaUrl: string;
    publicCsvUrl: string;
    songsJsonCacheKey: string;
    obsoleteCsvCacheKey: string;
    obsoleteLegacyCsvCacheKey: string;
};

/**
 * ブラウザ保存領域を使う曲データ取得元を作成する。
 * JSONはIndexedDBを主キャッシュとして使い、廃止済みCSVの削除は初期データの決定後に行う。
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
    const dataSource = createSongsDataSource({
        publicSongsJsonUrl,
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCache
    });
    return {
        /** 旧CSVの書込トランザクションがJSON読込を待たせないよう、後片付けを後に回す。 */
        async loadInitialSnapshot() {
            const snapshot = await dataSource.loadInitialSnapshot();
            void obsoleteCsvCache.removeText();
            return snapshot;
        }
    };
}
