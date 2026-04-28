export const SONGS_JSON_SCHEMA_VERSION = 1;

/**
 * 曲データ配列を現在のJSONスキーマへ包む。
 * @param {unknown[]} songs
 * @returns {{ schemaVersion: number, songs: unknown[] }}
 */
export function buildSongsJsonPayload(songs) {
    if (!Array.isArray(songs)) {
        throw new Error("songs json payload requires a songs array");
    }
    return {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        songs
    };
}

/**
 * 曲データJSONを検証して、現在のスキーマの曲配列を返す。
 * @param {string} jsonText
 * @returns {unknown[]}
 */
export function parseSongsJsonPayload(jsonText) {
    const payload = JSON.parse(jsonText);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("songs json payload must be an object");
    }
    if (payload.schemaVersion !== SONGS_JSON_SCHEMA_VERSION) {
        throw new Error(`unsupported songs json schema: ${payload.schemaVersion}`);
    }
    if (!Array.isArray(payload.songs)) {
        throw new Error("songs json payload requires a songs array");
    }
    return payload.songs;
}
