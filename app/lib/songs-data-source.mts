import { parseCsvToSongs } from "./csv-parser.mjs";
import {
    compareSongsJsonArtifactFreshness,
    parseSongsJsonMetaPayload,
    parseSongsJsonPayload,
    SONGS_JSON_SCHEMA_VERSION
} from "./songs-json.mjs";
import type { SongsJsonArtifactMetadata, SongsJsonPayload } from "./songs-json.mjs";

type SongsJsonCache = {
    getText: () => Promise<string | null>;
    setText: (value: string) => Promise<boolean>;
    removeText: () => Promise<void>;
};

type SongsDataSourceInput = {
    publicSongsJsonUrl?: string;
    publicSongsMetaUrl?: string;
    publicCsvUrl: string;
    songsJsonCache?: SongsJsonCache;
};

type SongsLoadedResult = {
    songs: Song[];
    source: string;
    resetConditions?: boolean;
};

type SongsLoadedCallback = (result: SongsLoadedResult) => void;

/**
 * 曲データの取得元とJSONキャッシュ更新を扱う data source を作成する。
 * @param input 公開データURLとJSONキャッシュ
 */
export function createSongsDataSource(input: SongsDataSourceInput) {
    const {
        publicSongsJsonUrl,
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCache
    } = input;

    /**
     * 非同期ストアから曲データJSONキャッシュを読み込む。
     * @returns キャッシュ文字列
     */
    async function getCachedSongsJsonText(): Promise<string | null> {
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
     * @param jsonText 保存するJSON文字列
     * @returns 保存できたか
     */
    async function setCachedSongsJsonText(jsonText: string): Promise<boolean> {
        if (!songsJsonCache) return false;
        try {
            return await songsJsonCache.setText(jsonText);
        } catch (error) {
            console.warn("曲データJSONキャッシュを保存できませんでした", error);
            return false;
        }
    }

    /**
     * 非同期ストアから不正な曲データJSONキャッシュを削除する。
     */
    async function removeCachedSongsJsonText(): Promise<void> {
        if (!songsJsonCache) return;
        try {
            await songsJsonCache.removeText();
        } catch (error) {
            console.warn("曲データJSONキャッシュを削除できませんでした", error);
        }
    }

    /**
     * 曲データJSONを取得する。
     * @returns JSON文字列
     */
    async function fetchSongsJsonText(): Promise<string> {
        if (!publicSongsJsonUrl) throw new Error("songs json url is not configured");
        const response = await fetch(publicSongsJsonUrl, { cache: "no-cache" });
        if (!response.ok) throw new Error("json fetch failed");
        return response.text();
    }

    /**
     * 曲データJSONのメタ情報を取得する。
     * @returns JSON文字列
     */
    async function fetchSongsMetaText(): Promise<string> {
        if (!publicSongsMetaUrl) throw new Error("songs meta url is not configured");
        const response = await fetch(publicSongsMetaUrl, { cache: "no-cache" });
        if (!response.ok) throw new Error("json meta fetch failed");
        return response.text();
    }

    /**
     * フォールバック用のCSVを取得する。
     * @returns CSV文字列
     */
    async function fetchCsvText(): Promise<string> {
        const response = await fetch(publicCsvUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("fetch failed");
        return response.text();
    }

    /**
     * ネットワークCSVを最後の取得手段として読み込む。
     * CSVは実行時キャッシュへ保存せず、そのセッションだけで使用する。
     * @param onSongsLoaded 読み込み結果の通知先
     * @returns 読み込めたか
     */
    async function loadCsvFallback(onSongsLoaded: SongsLoadedCallback): Promise<boolean> {
        try {
            const csvText = await fetchCsvText();
            const songs = parseCsvToSongs(csvText);
            onSongsLoaded({ songs, source: "network" });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * metaに対してJSON候補が現在有効か判定する。
     * hash一致または候補側の生成日時が新しい場合だけ採用できる。
     * @param candidate JSON候補
     * @param meta 比較対象のmeta
     * @returns 採用できるか
     */
    function isCurrentJsonCandidate(
        candidate: SongsJsonArtifactMetadata,
        meta: SongsJsonArtifactMetadata
    ): boolean {
        const freshness = compareSongsJsonArtifactFreshness(candidate, meta);
        return freshness === "same-content" || freshness === "candidate-newer";
    }

    /**
     * 曲データJSONをネットワークから読み込み、metaとの整合確認後に保存・表示する。
     * metaを取得できなかった場合は、JSON自身のschema検証を通過すれば採用する。
     * @param meta 比較対象のmeta、または取得失敗時のnull
     * @param onSongsLoaded 読み込み結果の通知先
     * @returns 読み込めたか
     */
    async function loadNetworkSongsJson(
        meta: SongsJsonArtifactMetadata | null,
        onSongsLoaded: SongsLoadedCallback
    ): Promise<boolean> {
        const jsonText = await fetchSongsJsonText();
        const payload = parseSongsJsonPayload(jsonText);
        if (payload.schemaVersion !== SONGS_JSON_SCHEMA_VERSION) {
            throw new Error("network songs json must use the current schemaVersion");
        }
        if (meta && !isCurrentJsonCandidate(payload, meta)) {
            throw new Error("songs json is older than or inconsistent with songs meta");
        }
        await setCachedSongsJsonText(jsonText);
        onSongsLoaded({ songs: payload.songs, source: "network" });
        return true;
    }

    /**
     * JSONキャッシュを検証し、不正なら削除する。
     * @returns 検証済みキャッシュ
     */
    async function loadValidatedSongsJsonCache(): Promise<SongsJsonPayload | null> {
        const cachedJson = await getCachedSongsJsonText();
        if (!cachedJson) return null;
        try {
            return parseSongsJsonPayload(cachedJson);
        } catch (error) {
            console.warn("曲データJSONキャッシュを読み込めませんでした", error);
            await removeCachedSongsJsonText();
            return null;
        }
    }

    /**
     * metaを取得して検証する。取得・検証に失敗してもJSON本体の取得は継続する。
     * @returns 検証済みmeta
     */
    async function loadSongsJsonMeta(): Promise<SongsJsonArtifactMetadata | null> {
        if (!publicSongsMetaUrl) return null;
        try {
            return parseSongsJsonMetaPayload(await fetchSongsMetaText());
        } catch (error) {
            console.warn("曲データJSONメタ情報の確認に失敗しました", error);
            return null;
        }
    }

    /**
     * JSONを優先して読み込み、有効なJSONキャッシュ、ネットワークCSVの順にフォールバックする。
     * @param onSongsLoaded 読み込み結果の通知先
     * @returns 読み込めたか
     */
    async function loadJsonOrCsvData(onSongsLoaded: SongsLoadedCallback): Promise<boolean> {
        const cachedPayload = await loadValidatedSongsJsonCache();
        const meta = await loadSongsJsonMeta();

        if (cachedPayload && meta && isCurrentJsonCandidate(cachedPayload, meta)) {
            onSongsLoaded({ songs: cachedPayload.songs, source: "cache" });
            return true;
        }

        if (publicSongsJsonUrl) {
            try {
                return await loadNetworkSongsJson(meta, onSongsLoaded);
            } catch {
                // 有効なJSONキャッシュがあればCSVより先に使用する。
            }
        }

        if (cachedPayload) {
            onSongsLoaded({ songs: cachedPayload.songs, source: "cache" });
            return true;
        }
        return loadCsvFallback(onSongsLoaded);
    }

    /**
     * 曲データを取得し、取得できた場合はcallbackへ曲配列を渡す。
     * @param callbacks 読み込み結果のcallback
     * @returns 読み込めたか
     */
    async function loadInitialSongs(
        callbacks: { onSongsLoaded: SongsLoadedCallback }
    ): Promise<boolean> {
        return loadJsonOrCsvData(callbacks.onSongsLoaded);
    }

    return {
        loadInitialSongs
    };
}
