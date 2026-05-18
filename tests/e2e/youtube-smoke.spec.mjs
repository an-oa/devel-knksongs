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
    openSettingsPanel,
    selectFrameScope,
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

test("settings exposes playback settings through console state", async ({ page }) => {
    await openSettingsPanel(page);

    const thumbnailSwitch = page.locator("#thumbnail-toggle").locator("xpath=ancestor::label[1]");
    const playbackSettingsGroup = page.locator("#playback-settings-group");
    const themeSwitch = page.locator("#theme-toggle").locator("xpath=ancestor::label[1]");

    await expect(themeSwitch).toBeVisible();
    await expect(playbackSettingsGroup).toBeHidden();

    await thumbnailSwitch.click();

    await expect(themeSwitch).toBeVisible();

    await page.evaluate(() => {
        window.knkPlaybackSettings.showExperimentalPlaybackSettings = true;
    });

    await expect(playbackSettingsGroup).toBeVisible();

    await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
    });

    await expect(playbackSettingsGroup).toBeVisible();

    await thumbnailSwitch.click();

    await expect(themeSwitch).toBeVisible();
    await expect(playbackSettingsGroup).toBeHidden();
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

test("frame scope filter switches between own and guest results", async ({ page }) => {
    await selectFrameScope(page, "guest");

    const guestCard = getSongCard(page, "Chain Alpha");
    await expect(guestCard).toBeVisible();
    await expect(guestCard.locator(".tag-collab")).toHaveText("コラボ");
    await expect(getSongCard(page, "Manual Song")).toHaveCount(0);
    await expect(getSongCard(page, "Replay Song")).toHaveCount(0);

    await selectFrameScope(page, "own");

    const manualCard = getSongCard(page, "Manual Song");
    const hostCard = getSongCard(page, "Replay Song");
    await expect(manualCard).toBeVisible();
    await expect(manualCard.locator(".tag-collab")).toHaveCount(0);
    await expect(hostCard).toBeVisible();
    await expect(hostCard.locator(".tag-collab")).toHaveText("コラボ");
    await expect(getSongCard(page, "Chain Alpha")).toHaveCount(0);
});

test("saved frame scope is restored after dynamic options render on boot", async ({ page }) => {
    await page.evaluate(() => {
        localStorage.setItem("searchStateV1", JSON.stringify({
            version: 2,
            query: "",
            relayOnly: false,
            harmonyOnly: false,
            frameScope: "guest",
            dateFrom: "",
            dateTo: "",
            formats: ["配信", "歌みた", "ショート", "切り抜き", "収録"]
        }));
    });
    await page.reload();
    await waitForInitialLoad(page);

    await expect(page.locator("#frameScopeOptions input[value=\"guest\"]")).toBeChecked();
    await expect(getSongCard(page, "Chain Alpha")).toBeVisible();
    await expect(getSongCard(page, "Manual Song")).toHaveCount(0);
    await expect(getSongCard(page, "Replay Song")).toHaveCount(0);
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

test("thumbnail images keep masonry layout stable after refresh", async ({ page }) => {
    await enablePlaybackSettings(page);
    await filterBySongTitle(page, "Artist");

    const cards = page.locator(".song-card");
    await expect(cards).toHaveCount(6);
    await expect(cards.first().locator("img")).toBeVisible();

    const before = await page.locator(".song-card").evaluateAll((nodes) => nodes.map((card) => ({
        songKey: card.dataset.songKey || "",
        top: card.style.top,
        imageDisplay: window.getComputedStyle(card.querySelector("img")).display
    })));

    await expect(before.every((entry) => entry.imageDisplay === "block")).toBe(true);

    await page.evaluate(async () => {
        const { applyMasonryLayout } = await import("/app/lib/render/masonry-layout.mjs?v=19");
        applyMasonryLayout(document.querySelector("#resultList"));
    });

    const after = await page.locator(".song-card").evaluateAll((nodes) => nodes.map((card) => ({
        songKey: card.dataset.songKey || "",
        top: card.style.top
    })));

    await expect(after).toEqual(before.map(({ songKey, top }) => ({ songKey, top })));
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
