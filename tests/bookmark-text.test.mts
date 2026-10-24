import test from "node:test";
import assert from "node:assert/strict";
import { getBookmarkText } from "../app/ui/bookmark/text.mts";
import {
    buildBookmarkImportConfirmMessage,
    buildBookmarkImportResultMessage,
    getBookmarkImportErrorMessage
} from "../app/ui/bookmark/import-export.mts";

test("bookmark text: English counts use singular and plural", () => {
    const en = getBookmarkText("en");

    assert.equal(en.songCount(1), "1 song");
    assert.equal(en.songCount(2), "2 songs");
    assert.equal(en.maxBookmarks(1), "You can have up to 1 bookmark. Delete a bookmark you no longer need.");
    assert.equal(en.importResult(1, 0), "Added 1 bookmark.");
    assert.equal(en.importResult(0, 3), "Overwrote 3 bookmarks.");
    assert.equal(en.importResult(2, 1), "Added 2 bookmarks and overwrote 1.");
    assert.equal(en.importResult(0, 0), "No bookmarks were changed.");
});

test("bookmark text: Japanese and English dictionaries keep the same message keys", () => {
    assert.deepEqual(Object.keys(getBookmarkText("en")).sort(), Object.keys(getBookmarkText("ja")).sort());
});

test("bookmark import messages: the language argument selects Japanese or English", () => {
    const failure = { ok: false, reason: "max_songs_per_bookmark", limit: 120, bookmarkName: "Morning" } as const;

    assert.equal(getBookmarkImportErrorMessage(failure, "ja"), "「Morning」は最大120曲までです。");
    assert.equal(getBookmarkImportErrorMessage(failure, "en"), "“Morning” can hold up to 120 songs.");
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "invalid_json" }, "en"),
        "This file isn't valid JSON."
    );
    assert.equal(buildBookmarkImportResultMessage({ addedCount: 1, updatedCount: 1 }, "en"), "Added 1 bookmark and overwrote 1.");
    assert.equal(
        buildBookmarkImportConfirmMessage({ bookmarkCount: 2, songCount: 1, currentBookmarkCount: 3 }, "en"),
        [
            "This deletes all your current bookmarks and replaces them with the file's contents.",
            "Bookmarks to delete: 3",
            "Bookmarks after replacing: 2 (1 song)",
            "Continue?"
        ].join("\n")
    );
});
