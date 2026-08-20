import { test, expect } from "@playwright/test";
import {
    installNetworkMocks,
    readSongsJsonCacheText,
    routeDeferredSongsJsonFixture
} from "./support/mock-youtube.mjs";
import { createScrollableResultSongs } from "./support/song-fixtures.mjs";
import {
    filterBySongTitle,
    getSongCard,
    openSidebar,
    waitForInitialLoad
} from "./support/ui-helpers.mjs";

/**
 * IndexedDBへ保存されている曲タイトルを返す。
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string[]>}
 */
async function readCachedSongTitles(page) {
    const cacheText = await readSongsJsonCacheText(page);
    if (!cacheText) return [];
    const payload = JSON.parse(cacheText);
    return Array.isArray(payload.songs)
        ? payload.songs.map((song) => song.title)
        : [];
}

test("cached songs stay visible until the next search commits a background refresh", async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await waitForInitialLoad(page);
    await expect.poll(() => readCachedSongTitles(page)).toContain("Manual Song");

    const freshSongs = createScrollableResultSongs(1);
    const deferredRefresh = await routeDeferredSongsJsonFixture(page, freshSongs);

    await page.reload();
    await waitForInitialLoad(page);
    await deferredRefresh.requestStarted;

    await openSidebar(page);
    await filterBySongTitle(page, "Manual Song");
    await expect(getSongCard(page, "Manual Song")).toBeVisible();
    await expect(getSongCard(page, "Scroll Song 01")).toHaveCount(0);

    deferredRefresh.releaseResponse();
    await expect.poll(() => readCachedSongTitles(page)).toEqual(["Scroll Song 01"]);

    await expect(getSongCard(page, "Manual Song")).toBeVisible();
    await expect(getSongCard(page, "Scroll Song 01")).toHaveCount(0);

    await openSidebar(page);
    await filterBySongTitle(page, "Scroll Song 01");
    await expect(getSongCard(page, "Scroll Song 01")).toBeVisible();
    await expect(getSongCard(page, "Manual Song")).toHaveCount(0);
});
