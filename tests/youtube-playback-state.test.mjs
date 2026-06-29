import test from "node:test";
import assert from "node:assert/strict";
import {
    createYoutubePlaybackState,
    isYoutubePlaybackSessionActive,
    reduceYoutubePlaybackState
} from "../_build/app/lib/youtube/playback-state.mjs";

test("youtube playback state: request playback creates next session and enters starting", () => {
    const initialState = createYoutubePlaybackState();

    const nextState = reduceYoutubePlaybackState(initialState, {
        type: "REQUEST_PLAYBACK"
    });

    assert.deepEqual(nextState, {
        sessionSequence: 1,
        transitionGeneration: 1,
        activeSessionId: 1,
        phase: "starting"
    });
});

test("youtube playback state: playback started only affects the active session", () => {
    const startingState = {
        sessionSequence: 2,
        transitionGeneration: 3,
        activeSessionId: 2,
        phase: "starting"
    };

    const staleState = reduceYoutubePlaybackState(startingState, {
        type: "PLAYBACK_STARTED",
        sessionId: 1
    });
    const activeState = reduceYoutubePlaybackState(startingState, {
        type: "PLAYBACK_STARTED",
        sessionId: 2
    });

    assert.equal(staleState, startingState);
    assert.deepEqual(activeState, {
        sessionSequence: 2,
        transitionGeneration: 3,
        activeSessionId: 2,
        phase: "playing"
    });
});

test("youtube playback state: restoring a stale session does not clear the current one", () => {
    const activeState = {
        sessionSequence: 4,
        transitionGeneration: 8,
        activeSessionId: 4,
        phase: "starting"
    };

    const nextState = reduceYoutubePlaybackState(activeState, {
        type: "RESTORE_PLAYBACK",
        sessionId: 3,
        preserveTransitionGeneration: true
    });

    assert.equal(nextState, activeState);
    assert.equal(isYoutubePlaybackSessionActive(nextState, 4), true);
});

test("youtube playback state: ended playback clears the active session and bumps generation", () => {
    const activeState = {
        sessionSequence: 5,
        transitionGeneration: 9,
        activeSessionId: 5,
        phase: "playing"
    };

    const nextState = reduceYoutubePlaybackState(activeState, {
        type: "PLAYBACK_ENDED",
        sessionId: 5
    });

    assert.deepEqual(nextState, {
        sessionSequence: 5,
        transitionGeneration: 10,
        activeSessionId: 0,
        phase: "idle"
    });
});
