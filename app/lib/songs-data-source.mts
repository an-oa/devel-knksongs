import { parseCsvToSongs } from "./csv-parser.mjs";
import {
    compareSongsJsonArtifactFreshness,
    parseSongsJsonMetaPayload,
    parseSongsJsonPayload
} from "./songs-json.mjs";
import type { SongsJsonArtifactMetadata, SongsJsonPayload } from "./songs-json.mjs";

export const DEFAULT_CACHED_SONGS_NETWORK_TIMEOUT_MS = 5000;
export const DEFAULT_SONGS_META_RESPONSE_TIMEOUT_MS = 2000;
export const DEFAULT_SONGS_JSON_RESPONSE_TIMEOUT_MS = 2000;
export const DEFAULT_SONGS_JSON_BODY_TIMEOUT_MS = 30000;
export const DEFAULT_SONGS_CSV_RESPONSE_TIMEOUT_MS = 3000;
export const DEFAULT_SONGS_CSV_BODY_TIMEOUT_MS = 30000;

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
    cachedSongsNetworkTimeoutMs?: number;
    songsMetaResponseTimeoutMs?: number;
    songsJsonResponseTimeoutMs?: number;
    songsJsonBodyTimeoutMs?: number;
    csvResponseTimeoutMs?: number;
    csvBodyTimeoutMs?: number;
};

export type SongsSnapshot = {
    songs: Song[];
    source: "cache" | "network";
};

type NetworkSongsJsonCandidate = {
    jsonText: string;
    payload: SongsJsonPayload;
};

/**
 * 曲データの取得元とJSONキャッシュ更新を扱う data source を作成する。
 * @param input 公開データURLとJSONキャッシュ
 */
export function createSongsDataSource(input: SongsDataSourceInput) {
    const {
        publicSongsJsonUrl,
        publicSongsMetaUrl,
        publicCsvUrl,
        songsJsonCache,
        cachedSongsNetworkTimeoutMs = DEFAULT_CACHED_SONGS_NETWORK_TIMEOUT_MS,
        songsMetaResponseTimeoutMs = DEFAULT_SONGS_META_RESPONSE_TIMEOUT_MS,
        songsJsonResponseTimeoutMs = DEFAULT_SONGS_JSON_RESPONSE_TIMEOUT_MS,
        songsJsonBodyTimeoutMs = DEFAULT_SONGS_JSON_BODY_TIMEOUT_MS,
        csvResponseTimeoutMs = DEFAULT_SONGS_CSV_RESPONSE_TIMEOUT_MS,
        csvBodyTimeoutMs = DEFAULT_SONGS_CSV_BODY_TIMEOUT_MS
    } = input;

    /** 各段階の待ち時間を共通期限までに制限し、期限切れなら次の通信を開始しない。 */
    function remainingTimeout(timeoutMs: number, deadline: number): number {
        const remaining = deadline - performance.now();
        if (remaining <= 0) throw new Error("songs network deadline exceeded");
        return Math.min(timeoutMs, remaining);
    }

    /**
     * response受信待ちと本文読込に別々の期限を設ける。
     * response受信後は短い待機期限を解除し、大きい本文を低速回線でも読み切れるようにする。
     * @param url 取得URL
     * @param cacheMode fetch cache mode
     * @param responseTimeoutMs response受信までの期限
     * @param bodyTimeoutMs response本文読込の期限
     * @param deadline metaとJSON本体に共通する通信期限（performance.now基準）
     * @returns response本文
     */
    async function fetchTextWithTimeout(
        url: string,
        cacheMode: RequestCache,
        responseTimeoutMs: number,
        bodyTimeoutMs: number,
        deadline: number
    ): Promise<string> {
        const abortController = new AbortController();
        let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(
            () => abortController.abort(),
            remainingTimeout(responseTimeoutMs, deadline)
        );
        const requestInit: RequestInit = {
            cache: cacheMode,
            signal: abortController.signal
        };
        try {
            const response = await fetch(url, requestInit);
            clearTimeout(timeoutId);
            timeoutId = null;
            if (!response.ok) throw new Error(`fetch failed: ${url}`);
            timeoutId = setTimeout(
                () => abortController.abort(),
                remainingTimeout(bodyTimeoutMs, deadline)
            );
            const text = await response.text();
            // タイマー実行が遅れた場合も、期限後の応答は採用しない。
            remainingTimeout(bodyTimeoutMs, deadline);
            return text;
        } catch (error) {
            abortController.abort();
            throw error;
        } finally {
            if (timeoutId !== null) clearTimeout(timeoutId);
        }
    }

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
    async function fetchSongsJsonText(deadline: number): Promise<string> {
        if (!publicSongsJsonUrl) throw new Error("songs json url is not configured");
        return fetchTextWithTimeout(
            publicSongsJsonUrl,
            "no-cache",
            songsJsonResponseTimeoutMs,
            songsJsonBodyTimeoutMs,
            deadline
        );
    }

    /**
     * 曲データJSONのメタ情報を取得する。
     * @returns JSON文字列
     */
    async function fetchSongsMetaText(deadline: number): Promise<string> {
        if (!publicSongsMetaUrl) throw new Error("songs meta url is not configured");
        return fetchTextWithTimeout(
            publicSongsMetaUrl,
            "no-cache",
            songsMetaResponseTimeoutMs,
            songsMetaResponseTimeoutMs,
            deadline
        );
    }

    /**
     * フォールバック用のCSVを取得する。
     * @returns CSV文字列
     */
    async function fetchCsvText(): Promise<string> {
        return fetchTextWithTimeout(
            publicCsvUrl,
            "no-store",
            csvResponseTimeoutMs,
            csvBodyTimeoutMs,
            Infinity
        );
    }

    /**
     * ネットワークCSVを最後の取得手段として読み込む。
     * CSVは実行時キャッシュへ保存せず、そのセッションだけで使用する。
     * @returns 読み込んだスナップショット
     */
    async function loadCsvFallback(): Promise<SongsSnapshot | null> {
        try {
            const csvText = await fetchCsvText();
            const songs = parseCsvToSongs(csvText);
            return { songs, source: "network" };
        } catch {
            return null;
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
     * 曲データJSONをネットワークから取得して構造を検証する。
     * 公開metaとの比較と保存は呼び出し側で行う。
     * @param deadline metaとJSON本体に共通する通信期限（performance.now基準）
     * @returns 検証済みネットワークJSON候補
     */
    async function loadNetworkSongsJsonCandidate(
        deadline: number
    ): Promise<NetworkSongsJsonCandidate> {
        const jsonText = await fetchSongsJsonText(deadline);
        return {
            jsonText,
            payload: parseSongsJsonPayload(jsonText)
        };
    }

    /** 公開metaとの整合性を確認し、検証済みJSONを保存して初期表示へ渡す。 */
    async function acceptNetworkSongsJson(
        candidate: NetworkSongsJsonCandidate,
        meta: SongsJsonArtifactMetadata | null
    ): Promise<SongsSnapshot> {
        const { jsonText, payload } = candidate;
        if (meta && !isCurrentJsonCandidate(payload, meta)) {
            throw new Error("songs json is older than or inconsistent with the public meta");
        }
        await setCachedSongsJsonText(jsonText);
        return { songs: payload.songs, source: "network" };
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
    async function loadSongsJsonMeta(
        deadline: number
    ): Promise<SongsJsonArtifactMetadata | null> {
        if (!publicSongsMetaUrl) return null;
        try {
            return parseSongsJsonMetaPayload(await fetchSongsMetaText(deadline));
        } catch (error) {
            console.warn("曲データJSONメタ情報の確認に失敗しました", error);
            return null;
        }
    }

    /**
     * 公開側を基準に初期データを選ぶ。キャッシュはmetaのhash一致時か取得失敗時だけ使う。
     * キャッシュがある場合はmetaとJSON本体の通信を合計5秒以内に制限する。
     * キャッシュがない場合はmetaと本体を並行取得し、失敗時はCSVへ進む。
     */
    async function loadInitialSnapshot(): Promise<SongsSnapshot | null> {
        const cachedPayload = await loadValidatedSongsJsonCache();
        if (publicSongsJsonUrl) {
            const deadline = cachedPayload
                ? performance.now() + cachedSongsNetworkTimeoutMs
                : Infinity;
            try {
                if (cachedPayload) {
                    const meta = await loadSongsJsonMeta(deadline);
                    if (meta?.contentHash === cachedPayload.contentHash) {
                        return { songs: cachedPayload.songs, source: "cache" };
                    }
                    const candidate = await loadNetworkSongsJsonCandidate(deadline);
                    return await acceptNetworkSongsJson(candidate, meta);
                }
                const [meta, candidate] = await Promise.all([
                    loadSongsJsonMeta(deadline),
                    loadNetworkSongsJsonCandidate(deadline)
                ]);
                return await acceptNetworkSongsJson(candidate, meta);
            } catch {
                // 公開JSONを利用できなければ、有効なキャッシュへ退避する。
            }
        }
        if (cachedPayload) {
            return { songs: cachedPayload.songs, source: "cache" };
        }
        return loadCsvFallback();
    }

    return { loadInitialSnapshot };
}
