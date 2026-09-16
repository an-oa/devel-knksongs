import {
    PUBLIC_SONGS_JSON_URL,
    PUBLIC_SONGS_META_URL,
    PUBLIC_CSV_URL,
    SONGS_JSON_CACHE_KEY,
    LEGACY_CSV_CACHE_KEY,
    CSV_CACHE_KEY
} from "./config.mjs";
import { createBrowserSongsDataSource } from "./ui/core/data-source.mjs";

// UI module の取得・初期化と並行して開始し、bootstrap でも同じ Promise を利用する。
const songsDataSource = createBrowserSongsDataSource({
    publicSongsJsonUrl: PUBLIC_SONGS_JSON_URL,
    publicSongsMetaUrl: PUBLIC_SONGS_META_URL,
    publicCsvUrl: PUBLIC_CSV_URL,
    songsJsonCacheKey: SONGS_JSON_CACHE_KEY,
    obsoleteCsvCacheKey: CSV_CACHE_KEY,
    obsoleteLegacyCsvCacheKey: LEGACY_CSV_CACHE_KEY
});

export const initialSongsSnapshot = songsDataSource.loadInitialSnapshot().catch((error: unknown) => {
    // UI の到着前に失敗しても未処理の rejection を残さず、読込エラー表示へ渡す。
    console.error("曲データの初期読み込みに失敗しました", error);
    return null;
});
