import test from "node:test";
import assert from "node:assert/strict";
import {
    applyYoutubeThumbnailImage,
    createYoutubeThumbnailImage,
    getSongKeyFromYoutubeThumb,
    preventYoutubeThumbnailDefaultAction,
    setYoutubeThumbnailExpandedCardState,
    setYoutubeThumbnailOrientation,
    setYoutubeThumbnailPlaybackState,
    suppressYoutubeThumbnailContextMenu
} from "../app/lib/youtube/thumbnail.mts";
import { installFakeDom, invokeListener } from "./test-helpers.mts";

test("youtube thumbnail: create/apply image sets the mqdefault source with native lazy loading", () => {
    const cleanup = installFakeDom();
    try {
        const thumb = document.createElement("div");
        const created = createYoutubeThumbnailImage("video1");
        assert.ok(created);
        assert.equal(created.loading, "lazy");
        assert.equal(created.src, "https://i.ytimg.com/vi/video1/mqdefault.jpg");

        applyYoutubeThumbnailImage(thumb, "video1");
        const img = thumb.querySelector("img");
        assert.ok(img);
        assert.equal(img.loading, "lazy");
        assert.equal(img.src, "https://i.ytimg.com/vi/video1/mqdefault.jpg");
    } finally {
        cleanup();
    }
});

test("youtube thumbnail: save-related default actions are suppressed", () => {
    const cleanup = installFakeDom();
    try {
        let prevented = false;
        preventYoutubeThumbnailDefaultAction({
            preventDefault() {
                prevented = true;
            }
        });
        assert.equal(prevented, true);

        const thumb = document.createElement("div");
        suppressYoutubeThumbnailContextMenu(thumb);
        prevented = false;
        invokeListener(thumb, "contextmenu", { preventDefault: () => { prevented = true; } });
        assert.equal(prevented, true);

        const img = createYoutubeThumbnailImage("video1");
        assert.ok(img);
        assert.equal(img.draggable, false);
        assert.equal(img.getAttribute("draggable"), "false");
        for (const type of ["contextmenu", "dragstart"]) {
            prevented = false;
            invokeListener(img, type, { preventDefault: () => { prevented = true; } });
            assert.equal(prevented, true, `${type} must prevent the default action`);
        }
    } finally {
        cleanup();
    }
});

test("youtube thumbnail: orientation, playing state, and expanded card state are reflected", () => {
    const cleanup = installFakeDom();
    try {
        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "song:test";
        const thumb = document.createElement("div");
        card.appendChild(thumb);

        setYoutubeThumbnailOrientation(thumb, "vertical");
        setYoutubeThumbnailPlaybackState(thumb, "playing");
        setYoutubeThumbnailExpandedCardState(thumb, true);

        assert.equal(thumb.dataset.videoOrientation, "vertical");
        assert.equal(thumb.classList.contains("playing"), true);
        assert.equal(card.classList.contains("song-card-expanded"), true);
        assert.equal(getSongKeyFromYoutubeThumb(thumb), "song:test");

        setYoutubeThumbnailPlaybackState(thumb, "stopped");
        setYoutubeThumbnailExpandedCardState(thumb, false);

        assert.equal(thumb.classList.contains("playing"), false);
        assert.equal(card.classList.contains("song-card-expanded"), false);
    } finally {
        cleanup();
    }
});
