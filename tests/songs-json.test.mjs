import test from "node:test";
import assert from "node:assert/strict";
import {
    buildSongsJsonPayload,
    parseSongsJsonPayload,
    SONGS_JSON_SCHEMA_VERSION
} from "../app/lib/songs-json.mjs";

test("songs json: builds and parses current schema payload", () => {
    const songs = [{ songKey: "archive-1::1" }];
    const payload = buildSongsJsonPayload(songs);
    assert.equal(payload.schemaVersion, SONGS_JSON_SCHEMA_VERSION);
    assert.equal(payload.songs, songs);
    assert.deepEqual(parseSongsJsonPayload(JSON.stringify(payload)), songs);
});

test("songs json: rejects unsupported schema versions", () => {
    const payload = {
        schemaVersion: SONGS_JSON_SCHEMA_VERSION + 1,
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
