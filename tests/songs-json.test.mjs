import test from "node:test";
import assert from "node:assert/strict";
import {
    buildSongsJsonMetaPayload,
    buildSongsJsonPayload,
    parseSongsJsonMetaPayload,
    parseSongsJsonPayload,
    SONGS_JSON_SCHEMA_VERSION
} from "../_build/app/lib/songs-json.mjs";
import { createSongFixture } from "./fixtures/song.mjs";

test("songs json: builds and parses current schema payload", () => {
    const songs = [createSongFixture()];
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

test("songs json: accepts nullable numeric fields and empty orientation", () => {
    const song = createSongFixture({
        dateKey: null,
        archiveOrder: null,
        endSeconds: null,
        videoOrientation: ""
    });
    const payload = buildSongsJsonPayload([song], "sha256:test");

    assert.deepEqual(parseSongsJsonPayload(JSON.stringify(payload)).songs, [song]);
});

test("songs json: rejects songs missing any required field", () => {
    const validSong = createSongFixture();
    for (const fieldName of Object.keys(validSong)) {
        const incompleteSong = { ...validSong };
        delete incompleteSong[fieldName];
        const payload = {
            schemaVersion: SONGS_JSON_SCHEMA_VERSION,
            contentHash: "sha256:test",
            songs: [incompleteSong]
        };

        assert.throws(
            () => parseSongsJsonPayload(JSON.stringify(payload)),
            new RegExp(`songs\\[0\\]\\.${fieldName} is required`),
            fieldName
        );
    }
});

test("songs json: rejects non-object songs and invalid field types", () => {
    const cases = [
        [null, /songs\[0\] must be an object/],
        [createSongFixture({ title: 42 }), /songs\[0\]\.title must be a string/],
        [createSongFixture({ sourceIndex: "0" }), /songs\[0\]\.sourceIndex must be a finite number/],
        [createSongFixture({ dateKey: "20260311" }), /songs\[0\]\.dateKey must be a finite number or null/],
        [createSongFixture({ isRelay: 0 }), /songs\[0\]\.isRelay must be a boolean/],
        [createSongFixture({ videoOrientation: "square" }), /songs\[0\]\.videoOrientation must be one of/]
    ];

    for (const [song, expected] of cases) {
        const payload = {
            schemaVersion: SONGS_JSON_SCHEMA_VERSION,
            contentHash: "sha256:test",
            songs: [song]
        };
        assert.throws(() => parseSongsJsonPayload(JSON.stringify(payload)), expected);
    }
});

test("songs json: builder rejects structurally incomplete songs", () => {
    assert.throws(
        () => buildSongsJsonPayload([{ songKey: "archive-1::1" }], "sha256:test"),
        /songs\[0\]\.date is required/
    );
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
