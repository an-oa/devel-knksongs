import test from "node:test";
import assert from "node:assert/strict";
import {
    destroyYoutubeSharedPlaybackPlayer,
    ensureYoutubeSharedPlaybackElements,
    getYoutubeSharedPlaybackState,
    getYoutubeSharedPlaybackThumb,
    setPendingYoutubeSharedPlaybackAttach,
    setYoutubeSharedPlaybackSessionId,
    syncYoutubeSharedPlaybackIframe
} from "../app/lib/youtube/shared-playback.mts";
import type { YoutubePlaybackStartAttempt } from "../app/lib/youtube/playback-start-attempt.mts";
import { installFakeDom, installFakeTimeouts } from "./test-helpers.mts";

test("youtube shared playback: state initializes and keeps pending attach/session metadata", (t) => {
    t.after(installFakeDom());
    const iframe = document.createElement("iframe");
    const youtube = {};
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);

    assert.equal(sharedPlayback.sessionId, 0);
    assert.equal(sharedPlayback.pendingAttach, null);

    setYoutubeSharedPlaybackSessionId(youtube, 5);
    setPendingYoutubeSharedPlaybackAttach(youtube, iframe, 5);

    assert.equal(sharedPlayback.sessionId, 5);
    assert.deepEqual(sharedPlayback.pendingAttach, {
        iframe,
        playbackSessionId: 5
    });
});

test("youtube shared playback: sync/update helpers keep iframe and active thumb in sync", () => {
    const cleanup = installFakeDom();
    try {
        const youtube = {};
        const iframe = document.createElement("iframe");
        const thumb = document.createElement("div");
        const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
        sharedPlayback.player = {
            getIframe() {
                return iframe;
            }
        };
        sharedPlayback.hostThumb = thumb;

        assert.equal(syncYoutubeSharedPlaybackIframe(youtube), iframe);
        assert.equal(sharedPlayback.iframe, iframe);

        sharedPlayback.player.getIframe = () => document.createElement("div");
        assert.equal(syncYoutubeSharedPlaybackIframe(youtube), iframe);

        setYoutubeSharedPlaybackSessionId(youtube, 7);
        assert.equal(getYoutubeSharedPlaybackThumb(youtube, 7), thumb);
        assert.equal(getYoutubeSharedPlaybackThumb(youtube, 8), null);
    } finally {
        cleanup();
    }
});

test("youtube shared playback: destroy removes player elements and retains the reusable close button", () => {
    const cleanup = installFakeDom();
    try {
        const youtube = {};
        const sharedPlayback = ensureYoutubeSharedPlaybackElements({
            youtube,
            syncIframe: () => null,
            createFrame: () => document.createElement("iframe"),
            createCloseButton: () => document.createElement("button")
        });
        const { iframe, closeButton } = sharedPlayback;
        assert.ok(iframe);
        assert.ok(closeButton);
        const thumb = document.createElement("div");
        thumb.appendChild(iframe);
        thumb.appendChild(closeButton);
        document.body.appendChild(thumb);

        let destroyCount = 0;
        sharedPlayback.player = {
            destroy() {
                destroyCount += 1;
            }
        };
        sharedPlayback.hostThumb = thumb;
        sharedPlayback.pendingAttach = { iframe: sharedPlayback.iframe, playbackSessionId: 3 };
        setYoutubeSharedPlaybackSessionId(youtube, 3);

        destroyYoutubeSharedPlaybackPlayer({
            youtube,
            syncIframe: () => sharedPlayback.iframe
        });

        assert.equal(destroyCount, 1);
        assert.equal(sharedPlayback.player, null);
        assert.equal(sharedPlayback.playerPromise, null);
        assert.equal(sharedPlayback.pendingAttach, null);
        assert.equal(sharedPlayback.iframe, null);
        assert.equal(sharedPlayback.hostThumb, null);
        assert.equal(sharedPlayback.sessionId, 0);
        assert.equal(thumb.children.length, 0);
        assert.equal(iframe.parentNode, null);
        assert.equal(closeButton.parentNode, null);
        assert.equal(sharedPlayback.closeButton, closeButton);
    } finally {
        cleanup();
    }
});

test("youtube shared playback: destroying the player preserves start attempts and unconfirmed sessions", (t) => {
    t.after(installFakeDom());
    const fakeTimeouts = installFakeTimeouts();
    t.after(() => fakeTimeouts.cleanup());
    const youtube = {};
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
    const resolve = t.mock.fn<YoutubePlaybackStartAttempt["resolve"]>(() => {});
    const attempt: YoutubePlaybackStartAttempt = {
        sessionId: 4,
        resolve,
        timeoutId: setTimeout(() => {}, 1000),
        context: { thumbDiv: document.createElement("div"), playbackMode: "manual" }
    };
    sharedPlayback.playbackStartAttempt = attempt;
    sharedPlayback.unconfirmedPlaybackStartSessionId = 4;

    destroyYoutubeSharedPlaybackPlayer({ youtube });

    assert.equal(sharedPlayback.playbackStartAttempt, attempt);
    assert.equal(sharedPlayback.unconfirmedPlaybackStartSessionId, 4);
    assert.equal(fakeTimeouts.timeoutCalls[0].cleared, false);
    assert.equal(resolve.mock.callCount(), 0);
});
