import test from "node:test";
import assert from "node:assert/strict";
import {
    isOriginalSongFormat,
    isShortFormat,
    isStreamFormat,
    isUtamitaEquivalentFormat,
    matchesSelectedFormat
} from "../_build/app/lib/song-format.mjs";

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
