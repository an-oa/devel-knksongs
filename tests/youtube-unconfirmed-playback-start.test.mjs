import test from "node:test";
import assert from "node:assert/strict";
import { createYoutubeUnconfirmedPlaybackStartManager } from "../_build/app/lib/youtube/unconfirmed-playback-start.mjs";

/**
 * 未確定再生開始 manager のテスト用状態を作る。
 * @returns {{ manager: *, sharedPlayback: * }}
 */
function createUnconfirmedStartHarness() {
    const sharedPlayback = {
        unconfirmedPlaybackStartSessionId: 0
    };
    const manager = createYoutubeUnconfirmedPlaybackStartManager({
        getSharedPlaybackState: () => sharedPlayback
    });
    return { manager, sharedPlayback };
}

test("youtube unconfirmed playback start: mark stores a valid session id", () => {
    const { manager, sharedPlayback } = createUnconfirmedStartHarness();

    manager.mark(12);

    assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 12);
});

test("youtube unconfirmed playback start: invalid mark clears the stored session", () => {
    const { manager, sharedPlayback } = createUnconfirmedStartHarness();

    manager.mark(12);
    manager.mark(0);

    assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 0);
});

test("youtube unconfirmed playback start: clear only removes the matching session", () => {
    const { manager, sharedPlayback } = createUnconfirmedStartHarness();

    manager.mark(12);

    assert.equal(manager.clear(13), false);
    assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 12);
    assert.equal(manager.clear(12), true);
    assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 0);
});

test("youtube unconfirmed playback start: consume returns whether it cleared a session", () => {
    const { manager, sharedPlayback } = createUnconfirmedStartHarness();

    manager.mark(12);

    assert.equal(manager.consume(12), true);
    assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 0);
    assert.equal(manager.consume(12), false);
});
