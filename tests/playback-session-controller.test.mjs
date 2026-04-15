import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackSessionController } from "../app/controllers/playback-session.mjs";

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
            loopPlayback: Boolean(settings.loopPlayback)
        }
    };
}

test("playback session: advances to next song and scrolls it into view", () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" },
            { songKey: "song:3" }
        ]
    };
    const ui = createPlaybackUi({ continuousPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({ data, ui });
    controller.setDependencies({
        playSongByKey: (songKey) => {
            calls.push(`play:${songKey}`);
            return true;
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
    });

    const continued = controller.continuePlayback("song:1");

    assert.equal(continued, true);
    assert.deepEqual(calls, ["play:song:2", "scroll:song:2"]);
});

test("playback session: tries later candidates when the next song cannot start", () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" },
            { songKey: "song:3" }
        ]
    };
    const ui = createPlaybackUi({ continuousPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({ data, ui });
    controller.setDependencies({
        playSongByKey: (songKey) => {
            calls.push(`play:${songKey}`);
            return songKey === "song:3";
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
    });

    const continued = controller.continuePlayback("song:1");

    assert.equal(continued, true);
    assert.deepEqual(calls, ["play:song:2", "play:song:3", "scroll:song:3"]);
});

test("playback session: repeats current song when loop-only mode is enabled", () => {
    const data = {
        currentResults: [
            { songKey: "song:1" },
            { songKey: "song:2" }
        ]
    };
    const ui = createPlaybackUi({ loopPlayback: true });
    const calls = [];
    const controller = createPlaybackSessionController({ data, ui });
    controller.setDependencies({
        playSongByKey: (songKey) => {
            calls.push(`play:${songKey}`);
            return true;
        },
        scrollSongIntoView: (songKey) => {
            calls.push(`scroll:${songKey}`);
        }
    });

    const continued = controller.continuePlayback("song:2");

    assert.equal(continued, true);
    assert.deepEqual(calls, ["play:song:2", "scroll:song:2"]);
});
