import test from "node:test";
import assert from "node:assert/strict";
import {
    applyYoutubePlayerIframeAttributes,
    buildYoutubeEmbedUrl,
    createYoutubeIframeApiLoader
} from "../app/lib/youtube/embed.mjs";
import { installFakeDom } from "./test-helpers.mjs";

test("youtube embed: buildYoutubeEmbedUrl includes playback params and optional end", () => {
    const cleanup = installFakeDom();
    try {
        const url = buildYoutubeEmbedUrl(
            { videoId: "abc123", startSeconds: 45 },
            { endSeconds: 75 }
        );
        assert.match(url, /^https:\/\/www\.youtube\.com\/embed\/abc123\?/);
        assert.match(url, /(?:\?|&)autoplay=1(?:&|$)/);
        assert.match(url, /(?:\?|&)start=45(?:&|$)/);
        assert.match(url, /(?:\?|&)end=75(?:&|$)/);
        assert.match(
            url,
            new RegExp(`(?:\\?|&)origin=${encodeURIComponent(globalThis.location.origin)}(?:&|$)`)
        );
    } finally {
        cleanup();
    }
});

test("youtube embed: applyYoutubePlayerIframeAttributes updates iframe attributes", () => {
    const cleanup = installFakeDom();
    try {
        const iframe = document.createElement("iframe");
        applyYoutubePlayerIframeAttributes(iframe);
        assert.equal(iframe.allow, "autoplay; encrypted-media");
        assert.equal(iframe.referrerPolicy, "strict-origin-when-cross-origin");
        assert.equal(iframe.allowFullscreen, true);
    } finally {
        cleanup();
    }
});

test("youtube embed: createYoutubeIframeApiLoader appends iframe api script and resolves on ready", async () => {
    const cleanup = installFakeDom();
    try {
        const youtube = { apiPromise: null };
        const loader = createYoutubeIframeApiLoader({
            youtube,
            iframeApiSrc: "https://www.youtube.com/iframe_api",
            iframeApiSelector: 'script[data-yt-iframe-api="true"]',
            readyPollMs: 50
        });

        const pending = loader.ensureReady();
        const script = document.head.children[0] || null;

        assert.ok(script);
        assert.equal(script.tagName, "SCRIPT");
        assert.equal(script.src, "https://www.youtube.com/iframe_api");
        assert.ok(youtube.apiPromise);

        globalThis.window.YT = { Player: class {} };
        globalThis.window.onYouTubeIframeAPIReady();

        await pending;
        assert.equal(await youtube.apiPromise, undefined);
    } finally {
        cleanup();
    }
});
