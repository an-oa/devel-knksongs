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
    shouldLoadYoutubeThumbnailNow,
    suppressYoutubeThumbnailContextMenu
} from "../_build/app/lib/youtube/thumbnail.mjs";
import { installFakeDom } from "./test-helpers.mjs";

test("youtube thumbnail: create/apply image keeps mqdefault source and eager load", () => {
    const cleanup = installFakeDom();
    try {
        const thumb = document.createElement("div");
        const created = createYoutubeThumbnailImage("video1");
        assert.ok(created);
        assert.equal(created.dataset.src, "https://i.ytimg.com/vi/video1/mqdefault.jpg");

        applyYoutubeThumbnailImage(thumb, "video1", { eager: true });
        const img = thumb.querySelector("img");
        assert.ok(img);
        assert.equal(img.dataset.src, "https://i.ytimg.com/vi/video1/mqdefault.jpg");
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
        const thumbContextMenu = thumb._events.get("contextmenu");
        assert.equal(typeof thumbContextMenu, "function");

        const img = createYoutubeThumbnailImage("video1");
        assert.ok(img);
        assert.equal(img.draggable, false);
        assert.equal(img.getAttribute("draggable"), "false");
        assert.equal(typeof img._events.get("contextmenu"), "function");
        assert.equal(typeof img._events.get("dragstart"), "function");
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

test("youtube thumbnail: shouldLoadYoutubeThumbnailNow uses viewport intersection", () => {
    const cleanup = installFakeDom();
    try {
        const thumb = document.createElement("div");
        thumb._rect = { top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 };
        assert.equal(shouldLoadYoutubeThumbnailNow(thumb), true);

        thumb._rect = { top: 900, bottom: 1000, left: 0, right: 100, width: 100, height: 100 };
        assert.equal(shouldLoadYoutubeThumbnailNow(thumb), false);
    } finally {
        cleanup();
    }
});
