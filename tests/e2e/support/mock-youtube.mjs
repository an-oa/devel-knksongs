import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { parseCsvToSongs } from "../../../app/lib/csv-parser.mjs";
import { buildSongsJsonMetaPayload, buildSongsJsonPayload } from "../../../app/lib/songs-json.mjs";
import { createSongsContentHash } from "../../../scripts/songs-content-hash.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureCsvPath = path.join(__dirname, "..", "fixtures", "smoke-songs.csv");
const csvFixturePromise = readFile(fixtureCsvPath, "utf8");

const songsJsonFixturePromise = csvFixturePromise.then((csvFixture) => {
    const songs = parseCsvToSongs(csvFixture);
    const contentHash = createSongsContentHash(songs);
    return {
        json: JSON.stringify(buildSongsJsonPayload(songs, contentHash)),
        meta: JSON.stringify(buildSongsJsonMetaPayload(contentHash))
    };
});

export const YOUTUBE_IFRAME_API_MOCK = `
(() => {
    const players = [];
    const behaviorMap = new Map();

    function getVideoIdFromIframe(iframe) {
        try {
            const url = new URL(iframe.src, window.location.href);
            const parts = url.pathname.split("/");
            return parts[parts.length - 1] || "";
        } catch {
            return "";
        }
    }

    class MockPlayer {
        constructor(host, options) {
            this.options = options || {};
            this.iframe = host && host.tagName === "IFRAME" ? host : document.createElement("iframe");
            if (this.iframe !== host && host && typeof host.appendChild === "function") {
                host.appendChild(this.iframe);
            }
            this.state = -1;
            this.videoId = getVideoIdFromIframe(this.iframe);
            this.behavior = behaviorMap.get(this.videoId) || "manual";
            players.push(this);
            if (this.options.events && typeof this.options.events.onReady === "function") {
                Promise.resolve().then(() => {
                    this.options.events.onReady({ target: this });
                });
            }
            if (this.behavior === "auto-playing") {
                setTimeout(() => this.__emit(window.YT.PlayerState.PLAYING), 0);
            } else if (this.behavior === "auto-error") {
                setTimeout(() => this.__error(150), 0);
            } else if (this.behavior === "auto-ended") {
                setTimeout(() => this.__emit(window.YT.PlayerState.ENDED), 0);
            }
        }

        getIframe() {
            return this.iframe;
        }

        getPlayerState() {
            return this.state;
        }

        stopVideo() {
            this.state = window.YT.PlayerState.PAUSED;
        }

        destroy() {}

        __emit(state) {
            this.state = state;
            if (this.options.events && typeof this.options.events.onStateChange === "function") {
                this.options.events.onStateChange({
                    data: state,
                    target: this
                });
            }
        }

        __error(code) {
            if (this.options.events && typeof this.options.events.onError === "function") {
                this.options.events.onError({
                    data: code,
                    target: this
                });
            }
        }
    }

    window.YT = {
        PlayerState: {
            ENDED: 0,
            PLAYING: 1,
            PAUSED: 2
        },
        Player: MockPlayer
    };

    window.__knkMockYoutube = {
        setBehavior(videoId, behavior) {
            behaviorMap.set(videoId, behavior);
        },
        emit(index, state) {
            const player = players[index];
            if (player) player.__emit(state);
        },
        error(index, code) {
            const player = players[index];
            if (player) player.__error(code);
        },
        latestIndex() {
            return players.length - 1;
        },
        latestVideoId() {
            const player = players[players.length - 1];
            return player ? player.videoId : "";
        },
        playerCount() {
            return players.length;
        }
    };

    if (typeof window.onYouTubeIframeAPIReady === "function") {
        window.onYouTubeIframeAPIReady();
    }
})();
`;

/**
 * 外部通信をローカル fixture / mock へ差し替える。
 * @param {import("@playwright/test").Page} page
 */
export async function installNetworkMocks(page) {
    const csvFixture = await csvFixturePromise;
    const songsJsonFixture = await songsJsonFixturePromise;
    await page.route("**/data/songs-meta.json*", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: songsJsonFixture.meta
        });
    });
    await page.route("**/data/songs.json*", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: songsJsonFixture.json
        });
    });
    await page.route("https://docs.google.com/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/csv; charset=utf-8",
            body: csvFixture
        });
    });
    await page.route("https://www.youtube.com/iframe_api", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/javascript; charset=utf-8",
            body: YOUTUBE_IFRAME_API_MOCK
        });
    });
    await page.route("https://www.youtube-nocookie.com/embed/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: "<!doctype html><title>mock youtube embed</title>"
        });
    });
    await page.route("https://i.ytimg.com/**", async (route) => {
        await route.fulfill({
            status: 204,
            body: ""
        });
    });
}

/**
 * YouTube API mock の利用可能化を待つ。
 * @param {import("@playwright/test").Page} page
 */
export async function waitForMockYoutube(page) {
    const { expect } = await import("@playwright/test");
    await expect.poll(async () => {
        return page.evaluate(() => typeof window.__knkMockYoutube === "object");
    }).toBe(true);
}

/**
 * モック YouTube プレーヤーの動画別ふるまいを設定する。
 * @param {import("@playwright/test").Page} page
 * @param {string} videoId
 * @param {string} behavior
 */
export async function setMockVideoBehavior(page, videoId, behavior) {
    await waitForMockYoutube(page);
    await page.evaluate(([nextVideoId, nextBehavior]) => {
        window.__knkMockYoutube.setBehavior(nextVideoId, nextBehavior);
    }, [videoId, behavior]);
}
