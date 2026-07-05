import test from "node:test";
import assert from "node:assert/strict";
import {
    readYoutubePlayerCurrentTime,
    readYoutubePlayerDuration,
    readYoutubePlayerState,
    YOUTUBE_PLAYER_STATE
} from "../_build/app/lib/youtube/player-state.mjs";

test("youtube player state: exposes YouTube iframe API state constants", () => {
    assert.deepEqual(YOUTUBE_PLAYER_STATE, {
        UNSTARTED: -1,
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        BUFFERING: 3,
        CUED: 5
    });
});

test("youtube player state: safe readers return finite values", () => {
    const player = {
        getPlayerState() {
            return 1;
        },
        getCurrentTime() {
            return 75;
        },
        getDuration() {
            return 120;
        }
    };

    assert.equal(readYoutubePlayerState(player), 1);
    assert.equal(readYoutubePlayerCurrentTime(player), 75);
    assert.equal(readYoutubePlayerDuration(player), 120);
});

test("youtube player state: safe readers return null for missing, invalid, or throwing values", () => {
    assert.equal(readYoutubePlayerState(null), null);
    assert.equal(readYoutubePlayerCurrentTime({}), null);
    assert.equal(readYoutubePlayerDuration({
        getDuration() {
            return Number.NaN;
        }
    }), null);
    assert.equal(readYoutubePlayerState({
        getPlayerState() {
            throw new Error("state unavailable");
        }
    }), null);
});
