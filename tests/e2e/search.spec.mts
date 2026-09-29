import { test, expect } from "@playwright/test";
import { installNetworkMocks } from "./support/network-mocks.mts";
import { routeSongsJsonFixture } from "./support/songs-network.mts";
import { clickControlLabel, closeSidebar, getSongCard, openSidebar, waitForInitialLoad } from "./support/ui-helpers.mts";
import { createScrollableResultSongs } from "./support/song-fixtures.mts";

test.beforeEach(async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await page.evaluate(() => {
        localStorage.clear();
    });
    await page.reload();
    await waitForInitialLoad(page);
});

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
