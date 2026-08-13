export const SONGS_JSON_SCHEMA_VERSION = 1;

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
 * @param schemaVersion 検証するschema version
 */
function assertSupportedSchemaVersion(schemaVersion: unknown): void {
    if (schemaVersion !== SONGS_JSON_SCHEMA_VERSION) {
        throw new Error(`unsupported songs json schema: ${schemaVersion}`);
    }
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
 * songs値を配列として検証し、各曲要素の構造を確認する。
 * @param songs 検証するsongs値
 * @returns 検証済み曲配列
 */
function parseSongsArray(songs: unknown): Song[] {
    if (!Array.isArray(songs)) {
        throw new Error("songs json payload requires a songs array");
    }
    songs.forEach((song, index) => assertSongStructure(song, index));
    return songs;
}

/**
 * 曲データ配列を現在のJSONスキーマへ包む。
 * @param songs 曲配列
 * @param contentHash 曲配列のhash
 * @returns 現在のスキーマで包んだpayload
 */
export function buildSongsJsonPayload(
    songs: unknown[],
    contentHash: string
): { schemaVersion: number; contentHash: string; songs: Song[] } {
    return {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        contentHash: parseContentHash(contentHash),
        songs: parseSongsArray(songs)
    };
}

/**
 * 曲データJSONのメタ情報を現在のJSONスキーマへ包む。
 * @param contentHash 曲配列のhash
 * @returns 現在のスキーマで包んだメタ情報
 */
export function buildSongsJsonMetaPayload(
    contentHash: string
): { schemaVersion: number; contentHash: string } {
    return {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        contentHash: parseContentHash(contentHash)
    };
}

/**
 * 曲データJSONを検証して、現在のスキーマの内容を返す。
 * @param jsonText JSON文字列
 * @returns 検証済みのhashと曲配列
 */
export function parseSongsJsonPayload(jsonText: string): { contentHash: string; songs: Song[] } {
    const payload = parseJsonObject(jsonText);
    assertSupportedSchemaVersion(payload.schemaVersion);
    const contentHash = parseContentHash(payload.contentHash);
    return {
        contentHash,
        songs: parseSongsArray(payload.songs)
    };
}

/**
 * 曲データJSONのメタ情報を検証して返す。
 * @param jsonText JSON文字列
 * @returns 検証済みのメタ情報
 */
export function parseSongsJsonMetaPayload(jsonText: string): { contentHash: string } {
    const payload = parseJsonObject(jsonText);
    assertSupportedSchemaVersion(payload.schemaVersion);
    return {
        contentHash: parseContentHash(payload.contentHash)
    };
}
