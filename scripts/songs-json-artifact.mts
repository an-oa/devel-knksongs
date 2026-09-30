import {
    parseSongsJsonMetaPayload,
    parseSongsJsonPayload,
    SONGS_JSON_SCHEMA_VERSION
} from "#app/lib/songs-json";
import { createSongsContentHash } from "./songs-content-hash.mts";

/**
 * CSVから生成した2つのJSON成果物について、スキーマ、contentHash、生成日時の整合性を検証する。
 * 曲データの意味的品質はマスターCSVの変換時に検証済みのため、ここでは再判定しない。
 * @param songsJsonText songs.jsonの内容
 * @param songsMetaJsonText songs-meta.jsonの内容
 * @returns 収録曲数
 */
export function validateSongsJsonArtifacts(songsJsonText: string, songsMetaJsonText: string): number {
    const songsPayload = parseSongsJsonPayload(songsJsonText);
    const metaPayload = parseSongsJsonMetaPayload(songsMetaJsonText);
    const issues = [];
    if (
        songsPayload.schemaVersion !== SONGS_JSON_SCHEMA_VERSION ||
        metaPayload.schemaVersion !== SONGS_JSON_SCHEMA_VERSION
    ) {
        issues.push("songs.json and songs-meta.json must use the current schemaVersion");
    }
    if (songsPayload.contentHash !== metaPayload.contentHash) {
        issues.push("songs.json and songs-meta.json contentHash values must match");
    }
    if (songsPayload.generatedAt !== metaPayload.generatedAt) {
        issues.push("songs.json and songs-meta.json generatedAt values must match");
    }
    const calculatedContentHash = createSongsContentHash(songsPayload.songs);
    if (songsPayload.contentHash !== calculatedContentHash) {
        issues.push("songs.json contentHash must match the serialized songs array");
    }
    if (issues.length > 0) {
        throw new Error(`songs json artifact validation failed:\n${issues.join("\n")}`);
    }
    return songsPayload.songs.length;
}
