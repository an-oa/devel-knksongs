import test from "node:test";
import assert from "node:assert/strict";
import {
    getPlaybackContinuationCandidates,
    getSequentialPlaybackCandidates
} from "../_build/app/lib/playback-sequence.mjs";

test("playback sequence: returns following songs without loop", () => {
    const results = [
        { songKey: "song-1" },
        { songKey: "song-2" },
        { songKey: "song-3" }
    ];

    assert.deepEqual(
        getSequentialPlaybackCandidates(results, "song-2", false),
        ["song-3"]
    );
});

test("playback sequence: wraps to head when loop is enabled", () => {
    const results = [
        { songKey: "song-1" },
        { songKey: "song-2" },
        { songKey: "song-3" }
    ];

    assert.deepEqual(
        getSequentialPlaybackCandidates(results, "song-3", true),
        ["song-1", "song-2"]
    );
});

test("playback sequence: single-item loop repeats the same song", () => {
    const results = [
        { songKey: "song-1" }
    ];

    assert.deepEqual(
        getSequentialPlaybackCandidates(results, "song-1", true),
        ["song-1"]
    );
});

test("playback sequence: loop without continuous playback repeats current song", () => {
    const results = [
        { songKey: "song-1" },
        { songKey: "song-2" },
        { songKey: "song-3" }
    ];

    assert.deepEqual(
        getPlaybackContinuationCandidates(results, "song-2", {
            continuousPlayback: false,
            loopPlayback: true
        }),
        ["song-2"]
    );
});

test("playback sequence: returns empty when both continuous and loop are off", () => {
    const results = [
        { songKey: "song-1" },
        { songKey: "song-2" }
    ];

    assert.deepEqual(
        getPlaybackContinuationCandidates(results, "song-1", {
            continuousPlayback: false,
            loopPlayback: false
        }),
        []
    );
});
