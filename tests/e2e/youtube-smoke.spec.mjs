import { test, expect } from "@playwright/test";
import {
    installNetworkMocks,
    routeSongsJsonFixture,
    setMockVideoBehavior,
    waitForMockYoutube
} from "./support/mock-youtube.mjs";
import {
    clickControlLabel,
    clickSidebarBackdrop,
    closeSidebar,
    createBookmarkFromSong,
    enablePlaybackSettings,
    expectBookmarkToast,
    expectSidebarPopoverClosed,
    expectSidebarPopoverOpen,
    filterBySongTitle,
    getBookmarkItem,
    getControlLabel,
    getSongCard,
    openBookmarkPanel,
    openSidebar,
    openSettingsPanel,
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

/**
 * 通常検索で 48 件を超える追加表示を検証するための曲 fixture を作る。
 * @param {number} count
 * @returns {Song[]}
 */
function createScrollableResultSongs(count) {
    return Array.from({ length: count }, (_, index) => {
        const sourceIndex = index + 1;
        const paddedIndex = String(sourceIndex).padStart(2, "0");
        const month = 2 + Math.floor(index / 28);
        const day = (index % 28) + 1;
        const date = `2024/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
        const videoId = `scroll-video-${paddedIndex}`;
        const title = `Scroll Song ${paddedIndex}`;
        const artist = "Scroll Artist";
        return {
            date,
            dateKey: 20240000 + (month * 100) + day,
            archiveId: `scroll-archive-${paddedIndex}`,
            archiveOrder: 1,
            sourceIndex,
            videoId,
            songKey: `scroll-archive-${paddedIndex}::1`,
            bookmarkSongKey: `${videoId}::1`,
            legacySongKey: `scroll-archive-${paddedIndex}::1::https://www.youtube.com/watch?v=${videoId}&t=${sourceIndex}s`,
            format: "配信",
            streamRole: "",
            videoOrientation: "",
            isRelay: false,
            isHarmony: false,
            title,
            artist,
            titleYomi: title,
            artistYomi: artist,
            url: `https://www.youtube.com/watch?v=${videoId}&t=${sourceIndex}s`,
            endSeconds: null,
            titleNorm: title.toLowerCase(),
            artistNorm: artist.toLowerCase(),
            titleYomiNorm: title.toLowerCase(),
            artistYomiNorm: artist.toLowerCase()
        };
    });
}

test("result tail sentinel appends search results when scrolling to the bottom", async ({ page }) => {
    await routeSongsJsonFixture(page, createScrollableResultSongs(60));
    await page.reload();
    await waitForInitialLoad(page);

    await openSidebar(page);
    await page.locator("#searchBox").fill("Scroll Artist");
    await expect(page.locator("#searchBox")).toHaveValue("Scroll Artist");
    await closeSidebar(page);

    const cards = page.locator(".song-card");
    const resultTailSentinel = page.locator("#resultTailSentinel");

    await expect(cards).toHaveCount(48);
    await expect(resultTailSentinel).not.toHaveAttribute("hidden", "");

    await resultTailSentinel.scrollIntoViewIfNeeded();

    await expect(cards).toHaveCount(60);
    await expect(getSongCard(page, "Scroll Song 60")).toBeVisible();
    await expect(resultTailSentinel).toHaveAttribute("hidden", "");
});

test("playback settings are gated by thumbnail visibility", async ({ page }) => {
    await openSettingsPanel(page);

    const thumbnailSwitch = getControlLabel(page, "#thumbnail-toggle");
    const playbackSettingsGroup = page.locator("#playback-settings-group");
    const experimentalPlaybackSettingsGroup = page.locator("#experimental-playback-settings");
    const playArchiveToEndSwitch = getControlLabel(page, "#play-archive-to-end-toggle");
    const themeSwitch = getControlLabel(page, "#theme-toggle");

    await expect(themeSwitch).toBeVisible();
    await expect(playbackSettingsGroup).toBeHidden();
    await expect(playArchiveToEndSwitch).toBeHidden();
    await expect(experimentalPlaybackSettingsGroup).toBeHidden();

    await thumbnailSwitch.click();

    await expect(themeSwitch).toBeVisible();
    await expect(playbackSettingsGroup).toBeVisible();
    await expect(playArchiveToEndSwitch).toBeVisible();
    await expect(page.locator("#play-archive-to-end-toggle-label")).toContainText("アーカイブ全体を再生");
    await expect(page.locator("#play-archive-to-end-toggle-help")).toContainText("OFFでは曲の終わりで停止します。");
    await expect(page.locator("#play-archive-to-end-toggle")).not.toBeChecked();

    await thumbnailSwitch.click();

    await expect(themeSwitch).toBeVisible();
    await expect(playbackSettingsGroup).toBeHidden();
    await expect(playArchiveToEndSwitch).toBeHidden();
    await expect(experimentalPlaybackSettingsGroup).toBeHidden();
});

test("console playback setting survives ui resync", async ({ page }) => {
    await openSettingsPanel(page);

    const thumbnailSwitch = getControlLabel(page, "#thumbnail-toggle");
    const playbackSettingsGroup = page.locator("#playback-settings-group");
    const experimentalPlaybackSettingsGroup = page.locator("#experimental-playback-settings");

    await thumbnailSwitch.click();
    await expect(playbackSettingsGroup).toBeVisible();
    await expect(experimentalPlaybackSettingsGroup).toBeHidden();
    expect(
        await page.evaluate(() => window.knkPlaybackSettings.showExperimentalPlaybackSettings),
    ).toBe(false);

    await page.evaluate(() => {
        window.knkPlaybackSettings.showExperimentalPlaybackSettings = true;
    });

    expect(
        await page.evaluate(() => window.knkPlaybackSettings.state.showExperimentalPlaybackSettings),
    ).toBe(true);
    await expect(playbackSettingsGroup).toBeVisible();
    await expect(experimentalPlaybackSettingsGroup).toBeVisible();

    await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
    });

    await expect(playbackSettingsGroup).toBeVisible();
    await expect(experimentalPlaybackSettingsGroup).toBeVisible();
});

test("archive playback setting persists across reload", async ({ page }) => {
    await openSettingsPanel(page);

    const thumbnailSwitch = getControlLabel(page, "#thumbnail-toggle");
    await thumbnailSwitch.click();

    const playArchiveToEndSwitch = getControlLabel(page, "#play-archive-to-end-toggle");
    await playArchiveToEndSwitch.click();

    await expect(page.locator("#play-archive-to-end-toggle")).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("playArchiveToEnd"))).toBe("true");

    await page.reload();
    await waitForInitialLoad(page);
    await openSettingsPanel(page);

    await expect(page.locator("#playback-settings-group")).toBeVisible();
    await expect(page.locator("#play-archive-to-end-toggle")).toBeChecked();
    expect(
        await page.evaluate(() => window.knkPlaybackSettings.state.playArchiveToEnd),
    ).toBe(true);
});

test("theme toggle syncs native color scheme", async ({ page }) => {
    await page.evaluate(() => {
        localStorage.setItem("theme", "light");
    });
    await page.reload();
    await waitForInitialLoad(page);
    await openSettingsPanel(page);

    const themeToggle = page.locator("#theme-toggle");
    const themeSwitch = getControlLabel(page, "#theme-toggle");

    await expect(themeToggle).not.toBeChecked();
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");

    await themeSwitch.click();

    await expect(themeToggle).toBeChecked();
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("theme")))
        .toBe("dark");

    await themeSwitch.click();

    await expect(themeToggle).not.toBeChecked();
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("theme")))
        .toBe("light");
});

test("sidebar native popover backdrop click closes and restores focus", async ({ page }) => {
    const openButton = page.locator("#open-sidebar");

    await openButton.focus();
    await expect(openButton).toBeFocused();

    await openSidebar(page);
    await expectSidebarPopoverOpen(page);

    await clickSidebarBackdrop(page);

    await expectSidebarPopoverClosed(page);
    await expect(openButton).toBeFocused();
});

test("search box date operators validate input and filter songs", async ({ page }) => {
    await openSidebar(page);

    const searchBox = page.locator("#searchBox");
    const searchError = page.locator("#searchBoxError");
    await expect(page.locator("#searchBoxHelp")).toHaveCount(0);
    await expect(searchBox).toHaveAttribute("aria-errormessage", "searchBoxError");

    await searchBox.fill("since:2024-02-30");
    await expect(searchBox).toHaveAttribute("aria-invalid", "true");
    await expect(searchError).toContainText("実在する日付");
    await expect(searchError).toContainText("二重引用符");
    await expect(searchError).toBeVisible();
    await expect(page.locator("#resultCount")).toHaveText("0 件がヒット");

    await searchBox.fill("since:2024-01-05 until:2024-01-04");
    await expect(searchBox).toHaveAttribute("aria-invalid", "true");
    await expect(searchError).toContainText("since の日付は until の日付以前");
    await expect(page.locator("#resultCount")).toHaveText("0 件がヒット");

    await searchBox.fill("Chain since:2024-01-04 until:2024-01-04");
    await expect(searchBox).not.toHaveAttribute("aria-invalid", "true");
    await expect(searchError).toBeHidden();
    await expect(page.locator("#resultCount")).toHaveText("1 件がヒット");
    await closeSidebar(page);

    await expect(getSongCard(page, "Chain Alpha")).toHaveCount(0);
    await expect(getSongCard(page, "Chain Beta")).toBeVisible();
});

test("search box restores an invalid query with its error and empty results", async ({ page }) => {
    await openSidebar(page);
    const searchBox = page.locator("#searchBox");
    await searchBox.fill("until:2026-13");
    await expect(searchBox).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#resultCount")).toHaveText("0 件がヒット");

    await page.reload();
    await waitForInitialLoad(page);

    await expect(page.locator("#resultCount")).toHaveText("0 件がヒット");
    await openSidebar(page);
    await expect(page.locator("#searchBox")).toHaveValue("until:2026-13");
    await expect(page.locator("#searchBox")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#searchBoxError")).toBeVisible();
});

test("search box treats an empty quoted query as recommendations after restore", async ({ page }) => {
    await openSidebar(page);
    const searchBox = page.locator("#searchBox");
    await searchBox.fill('""');
    await expect(searchBox).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#searchBoxError")).toBeHidden();
    await expect(page.locator("#resultCount")).toHaveText("おすすめを表示中");

    await page.reload();
    await waitForInitialLoad(page);

    await expect(page.locator("#resultCount")).toHaveText("おすすめを表示中");
    await openSidebar(page);
    await expect(page.locator("#searchBox")).toHaveValue('""');
    await expect(page.locator("#searchBoxError")).toBeHidden();
});

test("search box treats quoted phrases as literal text", async ({ page }) => {
    const [literalSong, escapedQuoteSong] = createScrollableResultSongs(2);
    literalSong.title = "Song until:2026-13";
    literalSong.titleYomi = "Song until:2026-13";
    literalSong.titleNorm = "song until:2026-13";
    literalSong.titleYomiNorm = "song until:2026-13";
    escapedQuoteSong.title = 'Don’t say "lazy"';
    escapedQuoteSong.titleYomi = 'Don’t say "lazy"';
    escapedQuoteSong.titleNorm = 'don’t say "lazy"';
    escapedQuoteSong.titleYomiNorm = 'don’t say "lazy"';
    await routeSongsJsonFixture(page, [literalSong, escapedQuoteSong]);
    await page.reload();
    await waitForInitialLoad(page);

    await openSidebar(page);
    const searchBox = page.locator("#searchBox");

    await searchBox.fill("until:2026-13");
    await expect(searchBox).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#resultCount")).toHaveText("0 件がヒット");

    await searchBox.fill('"Song until:2026-13"');

    await expect(searchBox).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#resultCount")).toHaveText("1 件がヒット");

    await searchBox.fill(String.raw`"Don’t say \"lazy\""`);
    await expect(searchBox).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#resultCount")).toHaveText("1 件がヒット");
    await closeSidebar(page);
    await expect(getSongCard(page, 'Don’t say "lazy"')).toBeVisible();
});

test("bookmark notification toast opens, closes, and auto-dismisses", async ({ page }) => {
    const bookmarkName = "Toast Check";
    await createBookmarkFromSong(page, {
        bookmarkName,
        songTitle: "Manual Song"
    });

    const createToast = await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」を作成し、「Manual Song」を保存しました。`
    );

    await createToast.locator(".bookmark-toast-close").click();
    await expect(createToast).toHaveCount(0);

    await openBookmarkPanel(page);
    await getBookmarkItem(page, bookmarkName).click();
    await page.locator("#close-bookmark-sidebar").click();
    await expect(page.locator("#sidebar")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#open-sidebar")).toHaveAttribute("aria-expanded", "false");

    const activeBookmarkCard = getSongCard(page, "Manual Song");
    await expect(activeBookmarkCard.locator(".remove-from-bookmark-btn")).toBeVisible();
    await activeBookmarkCard.locator(".remove-from-bookmark-btn").click();

    const removeToast = await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」から「Manual Song」を削除しました。`
    );
    await expect(removeToast).toHaveCount(0, { timeout: 6_000 });
});

test("active bookmark persists across reload", async ({ page }) => {
    const bookmarkName = "Reload Favorites";
    await createBookmarkFromSong(page, {
        bookmarkName,
        songTitle: "Manual Song"
    });

    const createToast = await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」を作成し、「Manual Song」を保存しました。`
    );
    await createToast.locator(".bookmark-toast-close").click();

    await openBookmarkPanel(page);
    const bookmarkItem = getBookmarkItem(page, bookmarkName);
    await bookmarkItem.click();
    await expect(bookmarkItem).toHaveClass(/active/);
    await expect(page.locator("#resultCount")).toHaveText(`ブックマーク: ${bookmarkName} (1 件)`);
    await expect.poll(() => page.evaluate(() => {
        return JSON.parse(localStorage.getItem("searchStateV1")).activeBookmarkId;
    })).toBeTruthy();

    await page.reload();
    await waitForInitialLoad(page);

    await expect(page.locator("#resultCount")).toHaveText(`ブックマーク: ${bookmarkName} (1 件)`);
    await openSidebar(page);
    await openBookmarkPanel(page);
    await expect(getBookmarkItem(page, bookmarkName)).toHaveClass(/active/);
});

test("bookmark deletion toast shows the deleted bookmark name", async ({ page }) => {
    const bookmarkName = "Delete Toast";
    await createBookmarkFromSong(page, {
        bookmarkName,
        songTitle: "Manual Song"
    });

    const createToast = await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」を作成し、「Manual Song」を保存しました。`
    );
    await createToast.locator(".bookmark-toast-close").click();
    await expect(createToast).toHaveCount(0);

    await openBookmarkPanel(page);

    const bookmarkItem = getBookmarkItem(page, bookmarkName);
    await expect(bookmarkItem).toBeVisible();
    await bookmarkItem.hover();
    await expect(bookmarkItem.locator(".bookmark-delete-btn")).toHaveCSS("pointer-events", "auto");

    const dialogPromise = new Promise((resolve) => {
        page.once("dialog", async (dialog) => {
            const message = dialog.message();
            await dialog.accept();
            resolve(message);
        });
    });

    await bookmarkItem.locator(".bookmark-delete-btn").click();
    expect(await dialogPromise).toBe(`ブックマーク「${bookmarkName}」を削除しますか？`);

    await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」を削除しました。`
    );
    await expect(bookmarkItem).toHaveCount(0);
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

test("thumbnail context menu is suppressed", async ({ page }) => {
    await enablePlaybackSettings(page);
    await filterBySongTitle(page, "Manual Song");

    const manualCard = getSongCard(page, "Manual Song");
    const thumbnail = manualCard.locator(".thumb");
    await expect(thumbnail.locator("img")).toBeVisible();

    await page.evaluate(() => {
        window.__knkLastThumbnailContextMenuPrevented = null;
        document.addEventListener("contextmenu", (event) => {
            window.__knkLastThumbnailContextMenuPrevented = event.defaultPrevented;
        }, { once: true });
    });
    await thumbnail.click({ button: "right" });

    await expect
        .poll(() => page.evaluate(() => window.__knkLastThumbnailContextMenuPrevented))
        .toBe(true);
});

test("collab role filters switch between host and guest results", async ({ page }) => {
    await openSidebar(page);
    await clickControlLabel(page, "#collabGuestOnly");
    await expect(page.locator("#collabGuestOnly")).toBeChecked();
    await closeSidebar(page);

    const guestCard = getSongCard(page, "Chain Alpha");
    await expect(guestCard).toBeVisible();
    await expect(guestCard.locator(".tag-collab")).toHaveText("コラボ");
    await expect(getSongCard(page, "Manual Song")).toHaveCount(0);
    await expect(getSongCard(page, "Replay Song")).toHaveCount(0);

    await openSidebar(page);
    await clickControlLabel(page, "#collabGuestOnly");
    await clickControlLabel(page, "#collabHostOnly");
    await expect(page.locator("#collabGuestOnly")).not.toBeChecked();
    await expect(page.locator("#collabHostOnly")).toBeChecked();
    await closeSidebar(page);

    const hostCard = getSongCard(page, "Replay Song");
    await expect(hostCard).toBeVisible();
    await expect(hostCard.locator(".tag-collab")).toHaveText("コラボ");
    await expect(getSongCard(page, "Manual Song")).toHaveCount(0);
    await expect(getSongCard(page, "Chain Alpha")).toHaveCount(0);

    await openSidebar(page);
    await clickControlLabel(page, "#collabGuestOnly");
    await expect(page.locator("#collabHostOnly")).toBeChecked();
    await expect(page.locator("#collabGuestOnly")).toBeChecked();
    await closeSidebar(page);

    await expect(getSongCard(page, "Replay Song")).toBeVisible();
    await expect(getSongCard(page, "Chain Alpha")).toBeVisible();
    await expect(getSongCard(page, "Manual Song")).toHaveCount(0);

    await openSidebar(page);
    await clickControlLabel(page, "#collabHostOnly");
    await clickControlLabel(page, "#collabGuestOnly");
    await page.locator("#searchBox").fill("Replay Song");
    await expect(page.locator("#searchBox")).toHaveValue("Replay Song");
    await closeSidebar(page);

    await expect(getSongCard(page, "Replay Song")).toBeVisible();
});

test("saved legacy guest frame scope is restored as collab guest filter", async ({ page }) => {
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

    await expect(page.locator("#collabGuestOnly")).toBeChecked();
    await expect(page.locator("#collabHostOnly")).not.toBeChecked();
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
        const { applyMasonryLayout } = await import("/app/lib/render/masonry-layout.mjs");
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
    await setMockVideoBehavior(page, "reject-alph", "auto-error");
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
    await setMockVideoBehavior(page, "chain-beta1", "auto-playing");
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
    }).toBe("chain-beta1");
});

test("continuous playback does not double-start the first successful autoplay successor after a rejection", async ({ page }) => {
    await enablePlaybackSettings(page, { continuousPlayback: true });
    await filterBySongTitle(page, "Artist");
    await setMockVideoBehavior(page, "replay-vide", "auto-error");
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
    await setMockVideoBehavior(page, "replay-vide", "auto-error");
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
