export const SONGS_JSON_SCHEMA_VERSION = 2;

const LEGACY_SONGS_JSON_SCHEMA_VERSION = 1;

type CurrentSongsJsonArtifactMetadata = {
    schemaVersion: typeof SONGS_JSON_SCHEMA_VERSION;
    contentHash: string;
    generatedAt: string;
};

type LegacySongsJsonArtifactMetadata = {
    schemaVersion: typeof LEGACY_SONGS_JSON_SCHEMA_VERSION;
    contentHash: string | null;
    generatedAt: null;
};

export type SongsJsonArtifactMetadata =
    | CurrentSongsJsonArtifactMetadata
    | LegacySongsJsonArtifactMetadata;

export type SongsJsonPayload = SongsJsonArtifactMetadata & {
    songs: Song[];
};

export type SongsJsonArtifactFreshness =
    | "same-content"
    | "candidate-newer"
    | "candidate-older"
    | "incomparable";

type SongFieldKind = "string" | "number" | "nullable-number" | "boolean" | "video-orientation";

const SONG_FIELD_KINDS = {
    date: "string",
    dateKey: "nullable-number",
    archiveId: "string",
    archiveOrder: "nullable-number",
    sourceIndex: "number",
    videoId: "string",
    songKey: "string",
    bookmarkSongKey: "string",
    legacySongKey: "string",
    format: "string",
    streamRole: "string",
    videoOrientation: "video-orientation",
    isRelay: "boolean",
    isHarmony: "boolean",
    title: "string",
    artist: "string",
    titleYomi: "string",
    artistYomi: "string",
    url: "string",
    endSeconds: "nullable-number",
    titleNorm: "string",
    artistNorm: "string",
    titleYomiNorm: "string",
    artistYomiNorm: "string"
} as const satisfies Record<keyof Song, SongFieldKind>;

const VIDEO_ORIENTATIONS = new Set<VideoOrientation>(["", "vertical", "landscape"]);

/**
 * 曲データJSONのcontentHashを検証する。
 * @param contentHash 検証するhash
 * @returns 検証済みhash
 */
function parseContentHash(contentHash: unknown): string {
    if (typeof contentHash !== "string" || contentHash.trim() === "") {
        throw new Error("songs json payload requires a contentHash");
    }
    return contentHash;
}

/**
 * 曲データJSONの生成日時をUTCのISO 8601形式として検証する。
 * @param generatedAt 検証する生成日時
 * @returns 検証済みの生成日時
 */
function parseGeneratedAt(generatedAt: unknown): string {
    if (typeof generatedAt !== "string") {
        throw new Error("songs json payload requires a generatedAt");
    }
    const timestamp = Date.parse(generatedAt);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== generatedAt) {
        throw new Error("songs json payload generatedAt must be a UTC ISO 8601 timestamp");
    }
    return generatedAt;
}

/**
 * JSON文字列をオブジェクトとして解析する。
 * @param jsonText JSON文字列
 * @returns 解析済みオブジェクト
 */
function parseJsonObject(jsonText: string): Record<string, unknown> {
    const payload: unknown = JSON.parse(jsonText);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("songs json payload must be an object");
    }
    return payload as Record<string, unknown>;
}

/**
 * 曲データJSONのschemaVersionを検証する。
 * Version 1は既存キャッシュのフォールバック利用に限って読み込み互換を保つ。
 * @param schemaVersion 検証するschema version
 * @returns 検証済みschema version
 */
function parseSupportedSchemaVersion(
    schemaVersion: unknown
): typeof LEGACY_SONGS_JSON_SCHEMA_VERSION | typeof SONGS_JSON_SCHEMA_VERSION {
    if (
        schemaVersion !== LEGACY_SONGS_JSON_SCHEMA_VERSION &&
        schemaVersion !== SONGS_JSON_SCHEMA_VERSION
    ) {
        throw new Error(`unsupported songs json schema: ${schemaVersion}`);
    }
    return schemaVersion;
}

/**
 * schema versionに応じてcontentHashを検証する。
 * 初期のVersion 1に存在しなかったcontentHashはnullへ正規化する。
 * @param schemaVersion 検証済みschema version
 * @param contentHash 検証するhash
 * @returns 検証済みhash、またはhashを持たない旧schemaを表すnull
 */
function parseContentHashForSchema(
    schemaVersion: typeof LEGACY_SONGS_JSON_SCHEMA_VERSION | typeof SONGS_JSON_SCHEMA_VERSION,
    contentHash: unknown
): string | null {
    if (schemaVersion === LEGACY_SONGS_JSON_SCHEMA_VERSION && contentHash === undefined) {
        return null;
    }
    return parseContentHash(contentHash);
}

/**
 * JSON上の曲フィールドが宣言された構造型に一致するか判定する。
 * @param fieldKind フィールドの構造型
 * @param value 検証する値
 */
function matchesSongFieldKind(fieldKind: SongFieldKind, value: unknown): boolean {
    if (fieldKind === "string") return typeof value === "string";
    if (fieldKind === "number") return typeof value === "number" && Number.isFinite(value);
    if (fieldKind === "nullable-number") {
        return value === null || (typeof value === "number" && Number.isFinite(value));
    }
    if (fieldKind === "boolean") return typeof value === "boolean";
    return typeof value === "string" && VIDEO_ORIENTATIONS.has(value as VideoOrientation);
}

/**
 * 曲フィールドの構造型をエラー表示用の説明へ変換する。
 * @param fieldKind フィールドの構造型
 * @returns 期待する値の説明
 */
function describeSongFieldKind(fieldKind: SongFieldKind): string {
    if (fieldKind === "string") return "a string";
    if (fieldKind === "number") return "a finite number";
    if (fieldKind === "nullable-number") return "a finite number or null";
    if (fieldKind === "boolean") return "a boolean";
    return 'one of "", "vertical", or "landscape"';
}

/**
 * 曲要素について、Songの必須フィールドと値の型を検証する。
 * 空文字やURL形式などの意味的品質はマスターCSVの変換時に別途検証する。
 * @param song 検証する曲要素
 * @param index songs配列上の位置
 */
function assertSongStructure(song: unknown, index: number): asserts song is Song {
    const location = `songs json payload songs[${index}]`;
    if (!song || typeof song !== "object" || Array.isArray(song)) {
        throw new Error(`${location} must be an object`);
    }
    const songRecord = song as Record<string, unknown>;
    for (const fieldName of Object.keys(SONG_FIELD_KINDS) as (keyof Song)[]) {
        if (!Object.hasOwn(songRecord, fieldName)) {
            throw new Error(`${location}.${fieldName} is required`);
        }
        const fieldKind = SONG_FIELD_KINDS[fieldName];
        if (!matchesSongFieldKind(fieldKind, songRecord[fieldName])) {
            throw new Error(`${location}.${fieldName} must be ${describeSongFieldKind(fieldKind)}`);
        }
    }
}

/**
 * 初期のVersion 1で存在しなかったstreamRoleを空文字へ正規化する。
 * ほかの構造エラーは後続の検証へ渡す。
 * @param song 正規化する曲要素
 * @returns Version 1の不足フィールドを補った曲要素
 */
function normalizeLegacySong(song: unknown): unknown {
    if (!song || typeof song !== "object" || Array.isArray(song)) return song;
    if (Object.hasOwn(song, "streamRole")) return song;
    return { ...song, streamRole: "" };
}

/**
 * songs値をschema versionに応じて正規化し、各曲要素の構造を確認する。
 * @param songs 検証するsongs値
 * @param schemaVersion 検証済みschema version
 * @returns 検証済み曲配列
 */
function parseSongsArray(
    songs: unknown,
    schemaVersion: typeof LEGACY_SONGS_JSON_SCHEMA_VERSION | typeof SONGS_JSON_SCHEMA_VERSION
): Song[] {
    if (!Array.isArray(songs)) {
        throw new Error("songs json payload requires a songs array");
    }
    const normalizedSongs = schemaVersion === LEGACY_SONGS_JSON_SCHEMA_VERSION
        ? songs.map(normalizeLegacySong)
        : songs;
    normalizedSongs.forEach((song, index) => assertSongStructure(song, index));
    return normalizedSongs;
}

/**
 * 曲データ配列を現在のJSONスキーマへ包む。
 * @param songs 曲配列
 * @param contentHash 曲配列のhash
 * @param generatedAt contentHashが生成された日時
 * @returns 現在のスキーマで包んだpayload
 */
export function buildSongsJsonPayload(
    songs: unknown[],
    contentHash: string,
    generatedAt: string
): SongsJsonPayload {
    return {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        contentHash: parseContentHash(contentHash),
        generatedAt: parseGeneratedAt(generatedAt),
        songs: parseSongsArray(songs, SONGS_JSON_SCHEMA_VERSION)
    };
}

/**
 * 曲データJSONのメタ情報を現在のJSONスキーマへ包む。
 * @param contentHash 曲配列のhash
 * @param generatedAt contentHashが生成された日時
 * @returns 現在のスキーマで包んだメタ情報
 */
export function buildSongsJsonMetaPayload(
    contentHash: string,
    generatedAt: string
): SongsJsonArtifactMetadata {
    return {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        contentHash: parseContentHash(contentHash),
        generatedAt: parseGeneratedAt(generatedAt)
    };
}

/**
 * 2つの曲データJSON成果物について、候補側の鮮度を判定する。
 * hash一致時は日時を参照せず、hash不一致で日時を比較できない場合はincomparableを返す。
 * @param candidate 採用候補の成果物メタ情報
 * @param reference 比較基準の成果物メタ情報
 * @returns 候補側から見た鮮度
 */
export function compareSongsJsonArtifactFreshness(
    candidate: SongsJsonArtifactMetadata,
    reference: SongsJsonArtifactMetadata
): SongsJsonArtifactFreshness {
    if (candidate.contentHash !== null && candidate.contentHash === reference.contentHash) {
        return "same-content";
    }
    if (!candidate.generatedAt || !reference.generatedAt) return "incomparable";
    const candidateTimestamp = Date.parse(candidate.generatedAt);
    const referenceTimestamp = Date.parse(reference.generatedAt);
    if (candidateTimestamp > referenceTimestamp) return "candidate-newer";
    if (candidateTimestamp < referenceTimestamp) return "candidate-older";
    return "incomparable";
}

/**
 * 曲データJSONを検証して、現在のスキーマの内容を返す。
 * @param jsonText JSON文字列
 * @returns 検証済みの成果物メタ情報と曲配列
 */
export function parseSongsJsonPayload(jsonText: string): SongsJsonPayload {
    const payload = parseJsonObject(jsonText);
    const schemaVersion = parseSupportedSchemaVersion(payload.schemaVersion);
    const songs = parseSongsArray(payload.songs, schemaVersion);
    if (schemaVersion === LEGACY_SONGS_JSON_SCHEMA_VERSION) {
        return {
            schemaVersion,
            contentHash: parseContentHashForSchema(schemaVersion, payload.contentHash),
            generatedAt: null,
            songs
        };
    }
    return {
        schemaVersion,
        contentHash: parseContentHash(payload.contentHash),
        generatedAt: parseGeneratedAt(payload.generatedAt),
        songs
    };
}

/**
 * 曲データJSONのメタ情報を検証して返す。
 * @param jsonText JSON文字列
 * @returns 検証済みのメタ情報
 */
export function parseSongsJsonMetaPayload(jsonText: string): SongsJsonArtifactMetadata {
    const payload = parseJsonObject(jsonText);
    const schemaVersion = parseSupportedSchemaVersion(payload.schemaVersion);
    if (schemaVersion === LEGACY_SONGS_JSON_SCHEMA_VERSION) {
        return {
            schemaVersion,
            contentHash: parseContentHashForSchema(schemaVersion, payload.contentHash),
            generatedAt: null
        };
    }
    return {
        schemaVersion,
        contentHash: parseContentHash(payload.contentHash),
        generatedAt: parseGeneratedAt(payload.generatedAt)
    };
}
