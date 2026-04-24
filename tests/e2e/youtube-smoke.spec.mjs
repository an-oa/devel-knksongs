import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureCsvPath = path.join(__dirname, "fixtures", "smoke-songs.csv");
const csvFixturePromise = readFile(fixtureCsvPath, "utf8");

const YOUTUBE_IFRAME_API_MOCK = `
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
async function installNetworkMocks(page) {
    const csvFixture = await csvFixturePromise;
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
    await page.route("https://www.youtube.com/embed/**", async (route) => {
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
 * 初期データ読み込み完了まで待機する。
 * @param {import("@playwright/test").Page} page
 */
async function waitForInitialLoad(page) {
    await expect(page.locator("#searchBox")).toBeEnabled();
    await expect(page.locator("#resultCount")).not.toHaveText("接続中...");
}

/**
 * サイドバーの設定パネルを開く。
 * @param {import("@playwright/test").Page} page
 */
async function openSettingsPanel(page) {
    await page.locator("#open-sidebar").click();
    await page.locator("#open-settings-panel").click();
    await expect(page.locator("#settings-sidebar-panel")).toBeVisible();
}

/**
 * 検索サイドバーを閉じて結果一覧へ戻る。
 * @param {import("@playwright/test").Page} page
 */
async function closeSidebar(page) {
    await page.locator("#close-sidebar").click();
    await expect(page.locator("#sidebar")).toHaveAttribute("aria-hidden", "true");
}

/**
 * 指定の設定トグルを必要時だけ ON にする。
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 */
async function ensureToggleEnabled(page, selector) {
    const toggle = page.locator(selector);
    const switchLabel = toggle.locator("xpath=ancestor::label[1]");
    await expect(switchLabel).toBeVisible();
    if (await toggle.isChecked()) return;
    await switchLabel.click();
}

/**
 * 再生設定を有効化する。
 * @param {import("@playwright/test").Page} page
 * @param {{ continuousPlayback?: boolean } | undefined} options
 */
async function enablePlaybackSettings(page, options) {
    const settings = options || {};
    await openSettingsPanel(page);
    await ensureToggleEnabled(page, "#thumbnail-toggle");
    if (settings.continuousPlayback) {
        await ensureToggleEnabled(page, "#experimental-playback-toggle");
        await ensureToggleEnabled(page, "#continuous-playback-toggle");
    }
    await page.locator("#close-settings-panel").click();
    await expect(page.locator("#searchBox")).toBeVisible();
}

/**
 * 曲タイトルで結果を絞り込む。
 * @param {import("@playwright/test").Page} page
 * @param {string} query
 */
async function filterBySongTitle(page, query) {
    await page.locator("#searchBox").fill(query);
    await expect(page.locator("#searchBox")).toHaveValue(query);
    await closeSidebar(page);
}

/**
 * YouTube API mock の利用可能化を待つ。
 * @param {import("@playwright/test").Page} page
 */
async function waitForMockYoutube(page) {
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
async function setMockVideoBehavior(page, videoId, behavior) {
    await waitForMockYoutube(page);
    await page.evaluate(([nextVideoId, nextBehavior]) => {
        window.__knkMockYoutube.setBehavior(nextVideoId, nextBehavior);
    }, [videoId, behavior]);
}

/**
 * タイトルを含む結果カードを返す。
 * @param {import("@playwright/test").Page} page
 * @param {string} title
 */
function getSongCard(page, title) {
    return page.locator(".song-card").filter({ hasText: title });
}

test.beforeEach(async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await page.evaluate(() => {
        localStorage.clear();
    });
    await page.reload();
    await waitForInitialLoad(page);
});

test("manual playback mounts an iframe from the thumbnail", async ({ page }) => {
    await enablePlaybackSettings(page);
    await filterBySongTitle(page, "Manual Song");

    const manualCard = getSongCard(page, "Manual Song");
    await expect(manualCard).toBeVisible();

    await manualCard.locator(".thumb").click();
    await waitForMockYoutube(page);

    await expect(manualCard.locator("iframe")).toBeVisible();
    await expect(manualCard.locator(".thumb-close-btn")).toBeVisible();
});

test("same thumbnail can be replayed after returning from the embedded player", async ({ page }) => {
    await enablePlaybackSettings(page);
    await filterBySongTitle(page, "Replay Song");

    const replayCard = getSongCard(page, "Replay Song");
    await expect(replayCard).toBeVisible();

    await replayCard.locator(".thumb").click();
    await waitForMockYoutube(page);
    await expect(replayCard.locator("iframe")).toBeVisible();
    await expect(page.locator(".thumb.playing")).toHaveCount(1);

    await replayCard.locator(".thumb-close-btn").click();
    await expect(replayCard.locator("iframe")).toHaveCount(0);
    await expect(replayCard.locator("img")).toBeVisible();

    await replayCard.locator(".thumb").click();
    await expect(replayCard.locator("iframe")).toBeVisible();
    await expect.poll(async () => {
        return page.evaluate(() => window.__knkMockYoutube.playerCount());
    }).toBe(2);
});

test("manual playback failure advances to the next result when continuous playback is enabled", async ({ page }) => {
    await enablePlaybackSettings(page, { continuousPlayback: true });
    await setMockVideoBehavior(page, "reject-alpha", "auto-error");
    await setMockVideoBehavior(page, "reject-beta", "auto-playing");
    await filterBySongTitle(page, "Reject");

    const firstCard = getSongCard(page, "Reject Alpha");
    const secondCard = getSongCard(page, "Reject Beta");
    await expect(firstCard).toBeVisible();
    await expect(secondCard).toBeVisible();

    await firstCard.locator(".thumb").click();

    await expect(firstCard.locator("iframe")).toHaveCount(0);
    await expect(secondCard.locator("iframe")).toBeVisible();
    await expect.poll(async () => {
        return page.evaluate(() => window.__knkMockYoutube.latestVideoId());
    }).toBe("reject-beta");
});

test("continuous playback advances to the next result after the current song ends", async ({ page }) => {
    await enablePlaybackSettings(page, { continuousPlayback: true });
    await setMockVideoBehavior(page, "chain-beta", "auto-playing");
    await filterBySongTitle(page, "Chain");

    const firstCard = getSongCard(page, "Chain Alpha");
    const secondCard = getSongCard(page, "Chain Beta");
    await expect(firstCard).toBeVisible();
    await expect(secondCard).toBeVisible();

    await firstCard.locator(".thumb").click();
    await expect(firstCard.locator("iframe")).toBeVisible();

    await page.evaluate(() => {
        const playerIndex = window.__knkMockYoutube.latestIndex();
        window.__knkMockYoutube.emit(playerIndex, window.YT.PlayerState.PLAYING);
        window.__knkMockYoutube.emit(playerIndex, window.YT.PlayerState.ENDED);
    });

    await expect(secondCard.locator("iframe")).toBeVisible();
    await expect.poll(async () => {
        return page.evaluate(() => window.__knkMockYoutube.latestVideoId());
    }).toBe("chain-beta");
});

test("continuous playback does not double-start the first successful autoplay successor after a rejection", async ({ page }) => {
    await enablePlaybackSettings(page, { continuousPlayback: true });
    await filterBySongTitle(page, "Artist");
    await setMockVideoBehavior(page, "replay-video", "auto-error");
    await setMockVideoBehavior(page, "chain-alpha", "auto-playing");

    const manualCard = getSongCard(page, "Manual Song");
    const replayCard = getSongCard(page, "Replay Song");
    const chainCard = getSongCard(page, "Chain Alpha");
    await expect(manualCard).toBeVisible();
    await expect(replayCard).toBeVisible();
    await expect(chainCard).toBeVisible();

    await manualCard.locator(".thumb").click();
    await expect(manualCard.locator("iframe")).toBeVisible();

    await page.evaluate(() => {
        const playerIndex = window.__knkMockYoutube.latestIndex();
        window.__knkMockYoutube.emit(playerIndex, window.YT.PlayerState.PLAYING);
        window.__knkMockYoutube.emit(playerIndex, window.YT.PlayerState.ENDED);
    });

    await expect(replayCard.locator("iframe")).toHaveCount(0);
    await expect(chainCard.locator("iframe")).toBeVisible();
    await expect.poll(async () => {
        return page.evaluate(() => window.__knkMockYoutube.playerCount());
    }).toBe(3);
});

test("autoplay rejection is logged as autoplay and does not use the manual failure bridge", async ({ page }) => {
    const debugMessages = [];
    page.on("console", (message) => {
        debugMessages.push(message.text());
    });
    await page.evaluate(() => {
        window.__KNK_DEBUG_YOUTUBE__ = true;
    });
    await enablePlaybackSettings(page, { continuousPlayback: true });
    await filterBySongTitle(page, "Artist");
    await setMockVideoBehavior(page, "replay-video", "auto-error");
    await setMockVideoBehavior(page, "chain-alpha", "auto-playing");

    const manualCard = getSongCard(page, "Manual Song");
    const chainCard = getSongCard(page, "Chain Alpha");
    await expect(manualCard).toBeVisible();

    await manualCard.locator(".thumb").click();
    await expect(manualCard.locator("iframe")).toBeVisible();

    await page.evaluate(() => {
        const playerIndex = window.__knkMockYoutube.latestIndex();
        window.__knkMockYoutube.emit(playerIndex, window.YT.PlayerState.PLAYING);
        window.__knkMockYoutube.emit(playerIndex, window.YT.PlayerState.ENDED);
    });

    await expect(chainCard.locator("iframe")).toBeVisible();
    await expect.poll(() => {
        return debugMessages.some((message) => message.includes(
            "[youtube] autoplay playback start failed; skipping candidate"
        ));
    }).toBe(true);
    await expect(
        debugMessages.some((message) => message.includes(
            "[script] continuePlayback requested from manual playback start failure"
        ))
    ).toBe(false);
});

test("autoplay rejection fallback restores the candidate thumbnail instead of leaving it stuck", async ({ page }) => {
    await enablePlaybackSettings(page, { continuousPlayback: true });
    await setMockVideoBehavior(page, "reject-beta", "auto-error");
    await filterBySongTitle(page, "Reject");

    const firstCard = getSongCard(page, "Reject Alpha");
    const secondCard = getSongCard(page, "Reject Beta");
    await expect(firstCard).toBeVisible();
    await expect(secondCard).toBeVisible();

    await firstCard.locator(".thumb").click();
    await expect(firstCard.locator("iframe")).toBeVisible();

    await page.evaluate(() => {
        const playerIndex = window.__knkMockYoutube.latestIndex();
        window.__knkMockYoutube.emit(playerIndex, window.YT.PlayerState.PLAYING);
        window.__knkMockYoutube.emit(playerIndex, window.YT.PlayerState.ENDED);
    });

    await expect(secondCard.locator("iframe")).toHaveCount(0);
    await expect(secondCard.locator("img")).toBeVisible();
    await expect(page.locator(".thumb.playing")).toHaveCount(0);
    await expect.poll(async () => {
        return page.evaluate(() => window.__knkMockYoutube.latestVideoId());
    }).toBe("reject-beta");
});
