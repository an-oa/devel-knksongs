import test from "node:test";
import assert from "node:assert/strict";
import {
    destroyYoutubeSharedPlayback,
    ensureYoutubeSharedPlaybackElements,
    ensureYoutubeSharedPlaybackParkingNode,
    getYoutubeSharedPlaybackState,
    getYoutubeSharedPlaybackThumb,
    setPendingYoutubeSharedPlaybackAttach,
    setYoutubeSharedPlaybackSessionId,
    syncYoutubeSharedPlaybackIframe
} from "../app/lib/youtube/shared-playback.mjs";
import { installFakeDom } from "./test-helpers.mjs";

test("youtube shared playback: state initializes and keeps pending attach/session metadata", () => {
    const youtube = {};
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);

    assert.equal(sharedPlayback.sessionId, 0);
    assert.equal(sharedPlayback.pendingAttach, null);

    setYoutubeSharedPlaybackSessionId(youtube, 5);
    setPendingYoutubeSharedPlaybackAttach(youtube, "iframe", 5);

    assert.equal(sharedPlayback.sessionId, 5);
    assert.deepEqual(sharedPlayback.pendingAttach, {
        iframe: "iframe",
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

        setYoutubeSharedPlaybackSessionId(youtube, 7);
        assert.equal(getYoutubeSharedPlaybackThumb(youtube, 7), thumb);
        assert.equal(getYoutubeSharedPlaybackThumb(youtube, 8), null);
    } finally {
        cleanup();
    }
});

test("youtube shared playback: ensure/create and destroy reset reusable elements", () => {
    const cleanup = installFakeDom();
    try {
        const youtube = {};
        const sharedPlayback = ensureYoutubeSharedPlaybackElements({
            youtube,
            syncIframe: () => null,
            createFrame: () => document.createElement("iframe"),
            createCloseButton: () => document.createElement("button")
        });
        const parkingNode = ensureYoutubeSharedPlaybackParkingNode(youtube);
        const child = document.createElement("div");
        parkingNode.appendChild(child);

        let destroyCount = 0;
        sharedPlayback.player = {
            destroy() {
                destroyCount += 1;
            }
        };
        sharedPlayback.hostThumb = document.createElement("div");
        sharedPlayback.pendingAttach = { iframe: sharedPlayback.iframe, playbackSessionId: 3 };
        sharedPlayback.playbackStartAttempt = { sessionId: 3 };
        setYoutubeSharedPlaybackSessionId(youtube, 3);

        destroyYoutubeSharedPlayback({
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
        assert.equal(parkingNode.children.length, 0);
    } finally {
        cleanup();
    }
});
