import test from "node:test";
import assert from "node:assert/strict";
import {
    exportBookmarksAsJsonText,
    parseBookmarkImportText
} from "../app/lib/storage/bookmark-transfer.mjs";

test("bookmark transfer: exports a versioned bookmark JSON payload", () => {
    const result = exportBookmarksAsJsonText({
        b1: { name: "A", songs: ["videoA::1"], createdAt: 1 }
    }, 2);

    assert.equal(result.ok, true);
    assert.equal(result.bookmarkCount, 1);
    assert.equal(result.songCount, 1);
    assert.deepEqual(JSON.parse(result.text), {
        version: 2,
        bookmarks: {
            b1: { name: "A", songs: ["videoA::1"], createdAt: 1 }
        }
    });
});

test("bookmark transfer: parses and migrates import payloads", () => {
    const result = parseBookmarkImportText(JSON.stringify({
        version: 1,
        bookmarks: {
            imported: {
                name: " Imported ",
                songs: ["arch1::1", "arch1::1"],
                createdAt: 2
            }
        }
    }), {
        songRows: [
            {
                sourceIndex: 0,
                songKey: "arch1::1",
                bookmarkSongKey: "videoA::1",
                legacySongKey: "arch1::1::https://youtu.be/videoA"
            }
        ],
        maxBookmarkCount: 20,
        maxSongsPerBookmark: 120
    });

    assert.equal(result.ok, true);
    assert.equal(result.bookmarkCount, 1);
    assert.equal(result.songCount, 1);
    assert.deepEqual(result.bookmarks, {
        imported: {
            name: "Imported",
            songs: ["videoA::1"],
            createdAt: 2
        }
    });
});

test("bookmark transfer: rejects invalid JSON and import files over limits", () => {
    const options = {
        songRows: [
            { songKey: "s1", bookmarkSongKey: "s1" },
            { songKey: "s2", bookmarkSongKey: "s2" }
        ],
        maxBookmarkCount: 1,
        maxSongsPerBookmark: 1,
        maxBookmarkNameLength: 64
    };

    assert.deepEqual(parseBookmarkImportText("{", options), {
        ok: false,
        reason: "invalid_json"
    });
    assert.deepEqual(parseBookmarkImportText(JSON.stringify({ hello: "world" }), options), {
        ok: false,
        reason: "invalid_bookmark_file"
    });
    assert.deepEqual(parseBookmarkImportText(JSON.stringify({
        version: 2,
        bookmarks: {
            b1: { name: "A", songs: ["s1"], createdAt: 1 },
            b2: { name: "B", songs: ["s2"], createdAt: 2 }
        }
    }), options), {
        ok: false,
        reason: "max_bookmark_count",
        limit: 1
    });
    assert.deepEqual(parseBookmarkImportText(JSON.stringify({
        version: 2,
        bookmarks: {
            b1: { name: "A", songs: ["s1", "s2"], createdAt: 1 }
        }
    }), options), {
        ok: false,
        reason: "max_songs_per_bookmark",
        limit: 1,
        bookmarkName: "A"
    });
    assert.deepEqual(parseBookmarkImportText(JSON.stringify({
        version: 2,
        bookmarks: {
            b1: { name: "A".repeat(65), songs: ["s1"], createdAt: 1 }
        }
    }), options), {
        ok: false,
        reason: "max_bookmark_name_length",
        limit: 64
    });
});
