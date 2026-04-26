import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackSessionController } from "../app/controllers/playback-session.mjs";
import {
    createYoutubePlaybackStartResult,
    YOUTUBE_PLAYBACK_START_STATUS
} from "../app/lib/youtube/playback-start-attempt.mjs";

/**
 * 再生セッション制御テスト用の UI 状態を作る。
 * @param {{ continuousPlayback?: boolean, loopPlayback?: boolean } | undefined} options
 * @returns {*}
 */
function createPlaybackUi(options) {
    const settings = options || {};
    return {
        playback: {
            continuousPlayback: Boolean(settings.continuousPlayback),
            loopPlayback: Boolean(settings.loopPlayback),
            activeThumb: settings.activeThumb ?? null
        }
    };
}

/**
 * 再生セッション用の依存関数を作る。
 * @param {*} input
 * @returns {*}
 */
function createPlaybackSessionCallbacks(input) {
    return {
        playSongByKey: input.playSongByKey,
        scrollSongIntoView: input.scrollSongIntoView
    };
}

/**
 * 再生開始結果テスト用の started 結果を返す。
 * @returns {{ status: string }}
 */
function playbackStarted() {
    return createYoutubePlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.STARTED);
}

/**
 * 再生開始結果テスト用の failed 結果を返す。
 * @returns {{ status: string }}
 */
function playbackFailed() {
    return createYoutubePlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED);
}

/**
 * 再生開始結果テスト用の unconfirmed 結果を返す。
 * @returns {{ status: string }}
 */
function playbackUnconfirmed() {
    return createYoutubePlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.UNCONFIRMED);
}

test("playback session: advances to next song and scrolls it into view", async () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" },
            { songKey: "song:3" }
        ]
    };
    const ui = createPlaybackUi({ continuousPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({
        data,
        ui,
        callbacks: createPlaybackSessionCallbacks({
        playSongByKey: (songKey) => {
            calls.push(`play:${songKey}`);
            return playbackStarted();
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
        })
    });

    const continued = await controller.continuePlayback("song:1");

    assert.equal(continued, true);
    assert.deepEqual(calls, ["play:song:2", "scroll:song:2"]);
});

test("playback session: tries later candidates when the next song cannot start", async () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" },
            { songKey: "song:3" }
        ]
    };
    const ui = createPlaybackUi({ continuousPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({
        data,
        ui,
        callbacks: createPlaybackSessionCallbacks({
        playSongByKey: (songKey) => {
            calls.push(`play:${songKey}`);
            return songKey === "song:3" ? playbackStarted() : playbackFailed();
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
        })
    });

    const continued = await controller.continuePlayback("song:1");

    assert.equal(continued, true);
    assert.deepEqual(calls, ["play:song:2", "play:song:3", "scroll:song:3"]);
});

test("playback session: repeats current song when loop-only mode is enabled", async () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" }
        ]
    };
    const ui = createPlaybackUi({ loopPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({
        data,
        ui,
        callbacks: createPlaybackSessionCallbacks({
        playSongByKey: (songKey) => {
            calls.push(`play:${songKey}`);
            return playbackStarted();
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
        })
    });

    const continued = await controller.continuePlayback("song:2");

    assert.equal(continued, true);
    assert.deepEqual(calls, ["play:song:2", "scroll:song:2"]);
});

test("playback session: awaits async playback failure before trying the next candidate", async () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" },
            { songKey: "song:3" }
        ]
    };
    const ui = createPlaybackUi({ continuousPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({
        data,
        ui,
        callbacks: createPlaybackSessionCallbacks({
        playSongByKey: (songKey) => {
            calls.push(`play:${songKey}`);
            return Promise.resolve(songKey === "song:3" ? playbackStarted() : playbackFailed());
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
        })
    });

    const continued = await controller.continuePlayback("song:1");

    assert.equal(continued, true);
    assert.deepEqual(calls, ["play:song:2", "play:song:3", "scroll:song:3"]);
});

test("playback session: stops trying later candidates when playback start is unconfirmed", async () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" },
            { songKey: "song:3" }
        ]
    };
    const ui = createPlaybackUi({ continuousPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({
        data,
        ui,
        callbacks: createPlaybackSessionCallbacks({
        playSongByKey: (songKey) => {
            calls.push(`play:${songKey}`);
            return playbackUnconfirmed();
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
        })
    });

    const continued = await controller.continuePlayback("song:1");

    assert.equal(continued, false);
    assert.deepEqual(calls, ["play:song:2"]);
});

test("playback session: stops trying later candidates after manual playback takes over", async () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" },
            { songKey: "song:3" }
        ]
    };
    const ui = createPlaybackUi({ continuousPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({
        data,
        ui,
        callbacks: createPlaybackSessionCallbacks({
        playSongByKey: async (songKey) => {
            calls.push(`play:${songKey}`);
            if (songKey === "song:2") {
                ui.playback.activeThumb = {
                    dataset: {
                        songKey: "song:manual"
                    }
                };
                return playbackFailed();
            }
            return playbackStarted();
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
        })
    });

    const continued = await controller.continuePlayback("song:1");

    assert.equal(continued, false);
    assert.deepEqual(calls, ["play:song:2"]);
});
