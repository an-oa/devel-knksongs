import { test, expect } from "@playwright/test";
import {
    installNetworkMocks,
    setMockVideoBehavior,
    waitForMockYoutube
} from "./support/mock-youtube.mjs";
import {
    enablePlaybackSettings,
    filterBySongTitle,
    getSongCard,
    waitForInitialLoad
} from "./support/ui-helpers.mjs";

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
