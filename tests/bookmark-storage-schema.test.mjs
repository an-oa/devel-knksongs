import test from "node:test";
import assert from "node:assert/strict";
import {
    buildStoredBookmarksPayload,
    migrateLegacyBookmarkSongRefsToCurrent,
    normalizeLegacySongRefToCurrent,
    parseStoredBookmarksPayload,
    sanitizeBookmarks
} from "../_build/app/lib/storage/bookmark-schema.mjs";

test("bookmark storage schema: parses legacy and versioned payloads with sanitization", () => {
    assert.deepEqual(
        parseStoredBookmarksPayload({
            version: 2,
            bookmarks: {
                keep: {
                    name: "  Saved List  ",
                    songs: ["song-1", "song-1", " ", 4, 4, null],
                    createdAt: 1710000000000
                },
                emptyName: {
                    name: "   ",
                    songs: ["song-2"],
                    createdAt: 1710000000001
                }
            }
        }),
        {
            version: 2,
            bookmarks: {
                keep: {
                    name: "Saved List",
                    songs: ["song-1", 4],
                    createdAt: 1710000000000
                }
            }
        }
    );

    assert.deepEqual(
        parseStoredBookmarksPayload({
            legacy: {
                name: "Legacy",
                songs: ["arch1::1"],
                createdAt: 10
            }
        }),
        {
            version: 1,
            bookmarks: {
                legacy: {
                    name: "Legacy",
                    songs: ["arch1::1"],
                    createdAt: 10
                }
            }
        }
    );
});

test("bookmark storage schema: builds versioned storage payload", () => {
    const bookmarks = {
        p_1: {
            name: "List",
            songs: ["videoA::1"],
            createdAt: 1
        }
    };

    assert.deepEqual(buildStoredBookmarksPayload(bookmarks, 2), {
        version: 2,
        bookmarks
    });
});

test("bookmark storage migration: rewrites legacy refs to current bookmark song keys", () => {
    const bookmarks = {
        p_1: {
            name: "Mixed refs",
            songs: [
                "arch1::01::https://youtu.be/videoA",
                "arch2::2",
                "arch2::2::https://youtu.be/videoB",
                0,
                "missing"
            ],
            createdAt: 1
        }
    };
    const songRows = [
        {
            sourceIndex: 0,
            songKey: "arch1::1",
            bookmarkSongKey: "videoA::1",
            legacySongKey: "arch1::1::https://youtu.be/videoA"
        },
        {
            sourceIndex: 1,
            songKey: "arch2::2",
            bookmarkSongKey: "videoB::2",
            legacySongKey: "arch2::2::https://youtu.be/videoB"
        }
    ];

    const result = migrateLegacyBookmarkSongRefsToCurrent({ bookmarks, songRows });

    assert.equal(result.updated, true);
    assert.deepEqual(result.changedBookmarkIds, ["p_1"]);
    assert.deepEqual(bookmarks.p_1.songs, ["videoA::1", "videoB::2"]);
    assert.deepEqual(result.changes, [
        {
            bookmarkId: "p_1",
            before: [
                "arch1::01::https://youtu.be/videoA",
                "arch2::2",
                "arch2::2::https://youtu.be/videoB",
                0,
                "missing"
            ],
            after: ["videoA::1", "videoB::2"]
        }
    ]);
});

test("bookmark storage migration: keeps current refs without marking changes", () => {
    const bookmarks = {
        p_1: {
            name: "Current refs",
            songs: ["videoA::1"],
            createdAt: 1
        }
    };

    const result = migrateLegacyBookmarkSongRefsToCurrent({
        bookmarks,
        songRows: [
            {
                sourceIndex: 0,
                songKey: "arch1::1",
                bookmarkSongKey: "videoA::1"
            }
        ]
    });

    assert.equal(result.updated, false);
    assert.deepEqual(result.changedBookmarkIds, []);
    assert.deepEqual(bookmarks.p_1.songs, ["videoA::1"]);
});

test("bookmark storage schema: normalizes legacy song refs by archive and order", () => {
    assert.equal(normalizeLegacySongRefToCurrent(" arch1 :: 001 :: https://youtu.be/videoA"), "arch1::1");
    assert.equal(normalizeLegacySongRefToCurrent("arch1::not-number"), "arch1::");
    assert.equal(normalizeLegacySongRefToCurrent("::1"), null);
    assert.equal(normalizeLegacySongRefToCurrent(null), null);
});

test("bookmark storage schema: sanitizes invalid bookmark maps to an empty object", () => {
    assert.deepEqual(sanitizeBookmarks(null), {});
    assert.deepEqual(sanitizeBookmarks([]), {});
});
