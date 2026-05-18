import test from "node:test";
import assert from "node:assert/strict";
import { dateKeyToParts, isWithinDateRange, parseDateKey } from "../app/lib/date-key.mjs";
import {
    FRAME_SCOPE_ALL,
    FRAME_SCOPE_GUEST,
    FRAME_SCOPE_OWN,
    matchesFrameScope,
    normalizeFrameScope
} from "../app/lib/frame-scope-filter.mjs";
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

test("frame scope helpers: normalize and match own or guest rows", () => {
    assert.equal(normalizeFrameScope("missing"), FRAME_SCOPE_ALL);
    assert.equal(normalizeFrameScope(FRAME_SCOPE_OWN), FRAME_SCOPE_OWN);
    assert.equal(matchesFrameScope({ streamRole: "" }, FRAME_SCOPE_OWN), true);
    assert.equal(matchesFrameScope({ streamRole: "ホスト" }, FRAME_SCOPE_OWN), true);
    assert.equal(matchesFrameScope({ streamRole: "ゲスト" }, FRAME_SCOPE_OWN), false);
    assert.equal(matchesFrameScope({ streamRole: "ゲスト" }, FRAME_SCOPE_GUEST), true);
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
