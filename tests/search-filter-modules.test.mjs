import test from "node:test";
import assert from "node:assert/strict";
import { dateKeyToParts, isWithinDateRange, parseDateKey } from "../app/lib/date-key.mjs";
import { matchesCollabRoleFilters } from "../app/lib/search-filters.mjs";
import {
    isOriginalSongFormat,
    isShortFormat,
    isStreamFormat,
    isUtamitaEquivalentFormat,
    matchesSelectedFormat
} from "../app/lib/song-format.mjs";

test("date key helpers: parse, split, and range checks", () => {
    assert.equal(parseDateKey("2024-02-29"), 20240229);
    assert.equal(parseDateKey("2024-02-30"), null);
    assert.deepEqual(dateKeyToParts(20240209), { year: 2024, month: 2, day: 9 });
    assert.equal(isWithinDateRange({ dateKey: 20240209 }, 20240201, 20240210), true);
    assert.equal(isWithinDateRange({ dateKey: 20240209 }, 20240210, null), false);
});

test("collab role helpers: match selected host and guest rows", () => {
    assert.equal(matchesCollabRoleFilters({ streamRole: "" }, {}), true);
    assert.equal(matchesCollabRoleFilters({ streamRole: "ホスト" }, { collabHostOnly: true }), true);
    assert.equal(matchesCollabRoleFilters({ streamRole: "ゲスト" }, { collabHostOnly: true }), false);
    assert.equal(matchesCollabRoleFilters({ streamRole: "ゲスト" }, { collabGuestOnly: true }), true);
    assert.equal(
        matchesCollabRoleFilters({ streamRole: "ホスト" }, { collabHostOnly: true, collabGuestOnly: true }),
        true
    );
    assert.equal(
        matchesCollabRoleFilters({ streamRole: "ゲスト" }, { collabHostOnly: true, collabGuestOnly: true }),
        true
    );
});

test("song format helpers: classify recommendation formats", () => {
    assert.equal(isStreamFormat("配信"), true);
    assert.equal(isShortFormat("ショート"), true);
    assert.equal(isOriginalSongFormat("オリ曲"), true);
    assert.equal(isUtamitaEquivalentFormat("歌みた"), true);
    assert.equal(isUtamitaEquivalentFormat("オリ曲"), true);
});

test("song format helpers: selected 歌みた includes オリ曲", () => {
    assert.equal(matchesSelectedFormat("オリ曲", new Set(["歌みた"])), true);
    assert.equal(matchesSelectedFormat("歌みた", new Set(["オリ曲"])), true);
    assert.equal(matchesSelectedFormat("配信", new Set(["歌みた"])), false);
});
