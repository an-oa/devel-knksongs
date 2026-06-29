import test from "node:test";
import assert from "node:assert/strict";
import {
    buildSongsJsonMetaPayload,
    buildSongsJsonPayload,
    parseSongsJsonMetaPayload,
    parseSongsJsonPayload,
    SONGS_JSON_SCHEMA_VERSION
} from "../_build/app/lib/songs-json.mjs";

test("songs json: builds and parses current schema payload", () => {
    const songs = [{ songKey: "archive-1::1" }];
    const contentHash = "sha256:test";
    const payload = buildSongsJsonPayload(songs, contentHash);
    assert.equal(payload.schemaVersion, SONGS_JSON_SCHEMA_VERSION);
    assert.equal(payload.contentHash, contentHash);
    assert.equal(payload.songs, songs);
    assert.deepEqual(parseSongsJsonPayload(JSON.stringify(payload)), {
        contentHash,
        songs
    });
});

test("songs json: builds and parses meta payload", () => {
    const contentHash = "sha256:test";
    const payload = buildSongsJsonMetaPayload(contentHash);
    assert.equal(payload.schemaVersion, SONGS_JSON_SCHEMA_VERSION);
    assert.equal(payload.contentHash, contentHash);
    assert.deepEqual(parseSongsJsonMetaPayload(JSON.stringify(payload)), { contentHash });
});

test("songs json: rejects unsupported schema versions", () => {
    const payload = {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION + 1,
        contentHash: "sha256:test",
        songs: []
    };
    assert.throws(
        () => parseSongsJsonPayload(JSON.stringify(payload)),
        /unsupported songs json schema/
    );
});

test("songs json: rejects unwrapped arrays", () => {
    assert.throws(
        () => parseSongsJsonPayload(JSON.stringify([])),
        /payload must be an object/
    );
});

test("songs json: rejects payloads without content hash", () => {
    const payload = {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION,
        songs: []
    };
    assert.throws(
        () => parseSongsJsonPayload(JSON.stringify(payload)),
        /requires a contentHash/
    );
});
