import test from "node:test";
import assert from "node:assert/strict";
import {
    buildSongsJsonMetaPayload,
    buildSongsJsonPayload,
    SONGS_JSON_SCHEMA_VERSION
} from "../_build/app/lib/songs-json.mjs";
import { createSongsContentHash } from "../scripts/songs-content-hash.mjs";
import { validateSongsJsonArtifacts } from "../scripts/songs-json-artifact.mjs";
import { createSongFixture } from "./fixtures/song.mjs";

/**
 * JSON成果物検証用のsongs.jsonとsongs-meta.jsonを作る。
 * @param {unknown[]} songs 曲配列
 * @returns {{ songsJson: string, metaJson: string, contentHash: string }}
 */
function makeArtifacts(songs) {
    const contentHash = createSongsContentHash(songs);
    return {
        songsJson: JSON.stringify(buildSongsJsonPayload(songs, contentHash)),
        metaJson: JSON.stringify(buildSongsJsonMetaPayload(contentHash)),
        contentHash
    };
}

test("songs json artifacts: accept matching derived files", () => {
    const artifacts = makeArtifacts([createSongFixture()]);
    assert.equal(validateSongsJsonArtifacts(artifacts.songsJson, artifacts.metaJson), 1);
});

test("songs json artifacts: reject mismatched metadata hashes", () => {
    const artifacts = makeArtifacts([createSongFixture()]);
    const mismatchedMeta = JSON.stringify(buildSongsJsonMetaPayload("sha256:different"));
    assert.throws(
        () => validateSongsJsonArtifacts(artifacts.songsJson, mismatchedMeta),
        /songs\.json and songs-meta\.json contentHash values must match/
    );
});

test("songs json artifacts: reject hashes that do not represent the songs array", () => {
    const contentHash = "sha256:not-the-song-content";
    const songsJson = JSON.stringify(buildSongsJsonPayload([createSongFixture()], contentHash));
    const metaJson = JSON.stringify(buildSongsJsonMetaPayload(contentHash));
    assert.throws(
        () => validateSongsJsonArtifacts(songsJson, metaJson),
        /contentHash must match the serialized songs array/
    );
});

test("songs json artifacts: reject structurally incomplete songs even when hashes match", () => {
    const songs = [{ songKey: "archive-1::1" }];
    const contentHash = createSongsContentHash(songs);
    const songsJson = JSON.stringify({
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        contentHash,
        songs
    });
    const metaJson = JSON.stringify(buildSongsJsonMetaPayload(contentHash));

    assert.throws(
        () => validateSongsJsonArtifacts(songsJson, metaJson),
        /songs\[0\]\.date is required/
    );
});

test("songs json artifacts: reject unsupported schemas in either derived file", () => {
    const artifacts = makeArtifacts([]);
    const invalidMeta = JSON.stringify({
        schemaVersion: 999,
        contentHash: artifacts.contentHash
    });
    assert.throws(
        () => validateSongsJsonArtifacts(artifacts.songsJson, invalidMeta),
        /unsupported songs json schema/
    );
});
