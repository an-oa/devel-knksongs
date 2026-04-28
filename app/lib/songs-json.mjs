export const SONGS_JSON_SCHEMA_VERSION = 1;

/**
 * 曲データJSONのcontentHashを検証する。
 * @param {*} contentHash
 * @returns {string}
 */
function parseContentHash(contentHash) {
    if (typeof contentHash !== "string" || contentHash.trim() === "") {
        throw new Error("songs json payload requires a contentHash");
    }
    return contentHash;
}

/**
 * JSON文字列をオブジェクトとして解析する。
 * @param {string} jsonText
 * @returns {Record<string, unknown>}
 */
function parseJsonObject(jsonText) {
    const payload = JSON.parse(jsonText);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("songs json payload must be an object");
    }
    return payload;
}

/**
 * 曲データJSONのschemaVersionを検証する。
 * @param {*} schemaVersion
 */
function assertSupportedSchemaVersion(schemaVersion) {
    if (schemaVersion !== SONGS_JSON_SCHEMA_VERSION) {
        throw new Error(`unsupported songs json schema: ${schemaVersion}`);
    }
}

/**
 * 曲データ配列を現在のJSONスキーマへ包む。
 * @param {unknown[]} songs
 * @param {string} contentHash
 * @returns {{ schemaVersion: number, contentHash: string, songs: unknown[] }}
 */
export function buildSongsJsonPayload(songs, contentHash) {
    if (!Array.isArray(songs)) {
        throw new Error("songs json payload requires a songs array");
    }
    return {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        contentHash: parseContentHash(contentHash),
        songs
    };
}

/**
 * 曲データJSONのメタ情報を現在のJSONスキーマへ包む。
 * @param {string} contentHash
 * @returns {{ schemaVersion: number, contentHash: string }}
 */
export function buildSongsJsonMetaPayload(contentHash) {
    return {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        contentHash: parseContentHash(contentHash)
    };
}

/**
 * 曲データJSONを検証して、現在のスキーマの内容を返す。
 * @param {string} jsonText
 * @returns {{ contentHash: string, songs: unknown[] }}
 */
export function parseSongsJsonPayload(jsonText) {
    const payload = parseJsonObject(jsonText);
    assertSupportedSchemaVersion(payload.schemaVersion);
    const contentHash = parseContentHash(payload.contentHash);
    if (!Array.isArray(payload.songs)) {
        throw new Error("songs json payload requires a songs array");
    }
    return {
        contentHash,
        songs: payload.songs
    };
}

/**
 * 曲データJSONのメタ情報を検証して返す。
 * @param {string} jsonText
 * @returns {{ contentHash: string }}
 */
export function parseSongsJsonMetaPayload(jsonText) {
    const payload = parseJsonObject(jsonText);
    assertSupportedSchemaVersion(payload.schemaVersion);
    return {
        contentHash: parseContentHash(payload.contentHash)
    };
}
