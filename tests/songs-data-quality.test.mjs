import test from "node:test";
import assert from "node:assert/strict";
import {
    validateSongsDataQuality,
    validateSongYoutubeFields
} from "../_build/app/lib/songs-data-quality.mjs";

/**
 * 検証用の曲データを作成する。
 * @param {Record<string, unknown>} overrides
 * @returns {Record<string, unknown>}
 */
function makeSong(overrides = {}) {
    return {
        sourceIndex: 0,
        title: "Song",
        artist: "Artist",
        url: "https://www.youtube.com/watch?v=7fOw-4QeB7M&t=349s",
        endSeconds: 649,
        ...overrides
    };
}

test("songs data quality: accepts valid CSV-derived song data", () => {
    assert.deepEqual(validateSongsDataQuality([makeSong()]), []);
});

test("songs data quality: rejects invalid YouTube hosts with the CSV row", () => {
    const issues = validateSongsDataQuality([
        makeSong({ url: "https://example.com/watch?v=7fOw-4QeB7M&t=349s" })
    ]);
    assert.match(issues.join("\n"), /url host must be a supported YouTube host/);
    assert.match(issues.join("\n"), /CSV 2行目「Song」/);
});

test("songs data quality: rejects invalid extracted video IDs", () => {
    const issues = [];
    validateSongYoutubeFields(
        makeSong({ url: "https://www.youtube.com/watch?v=short&t=349s" }),
        0,
        issues
    );
    assert.match(issues.join("\n"), /extracted videoId must match/);
});

test("songs data quality: rejects empty required text fields", () => {
    const issues = validateSongsDataQuality([
        makeSong({ title: " ", artist: "", url: "" })
    ]);
    assert.match(issues.join("\n"), /title must not be empty/);
    assert.match(issues.join("\n"), /artist must not be empty/);
    assert.match(issues.join("\n"), /url must not be empty/);
});

test("songs data quality: rejects invalid start seconds from URL", () => {
    const issues = validateSongsDataQuality([
        makeSong({ url: "https://youtu.be/7fOw-4QeB7M?t=-1" })
    ]);
    assert.match(issues.join("\n"), /startSeconds must be a finite number/);
});

test("songs data quality: accepts whole-video bounds and rejects invalid end seconds", () => {
    assert.deepEqual(validateSongsDataQuality([makeSong({
        url: "https://youtu.be/7fOw-4QeB7M",
        endSeconds: null
    })]), []);
    assert.match(
        validateSongsDataQuality([makeSong({ endSeconds: Number.NaN })]).join("\n"),
        /endSeconds must be a finite number/
    );
    assert.match(
        validateSongsDataQuality([makeSong({ endSeconds: 100 })]).join("\n"),
        /endSeconds must be greater than startSeconds/
    );
});
