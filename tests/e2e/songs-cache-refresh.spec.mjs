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

for (const [label, generatedAt] of [
    ["newer", "2026-08-15T00:00:00.000Z"],
    ["older", "2026-08-13T00:00:00.000Z"]
]) {
    test(`${label} public songs appear in the initial results after meta confirmation`, async ({ page }) => {
        await installNetworkMocks(page);
        await page.goto("/");
        await waitForInitialLoad(page);
        await expect.poll(() => readCachedSongTitles(page)).toContain("Manual Song");
        await openSidebar(page);
        await filterBySongTitle(page, "Song");
        await expect(getSongCard(page, "Manual Song")).toBeVisible();

        const publicSongs = createScrollableResultSongs(1);
        const deferred = await routeDeferredSongsJsonFixture(page, publicSongs, generatedAt);
        await page.reload();
        await deferred.requestStarted;
        try {
            await expect(page.locator("#searchBox")).toBeDisabled();
            await expect(page.locator("#resultCount")).toHaveText("データを読み込み中...");
            await expect(getSongCard(page, "Manual Song")).toHaveCount(0);
        } finally {
            deferred.releaseResponse();
        }

        await waitForInitialLoad(page);
        // 検索操作を追加せず、復元済みの条件による最初の結果で公開データを確認する。
        await expect(getSongCard(page, "Scroll Song 01")).toBeVisible();
        await expect(getSongCard(page, "Manual Song")).toHaveCount(0);
        await expect.poll(() => readCachedSongTitles(page)).toEqual(["Scroll Song 01"]);
    });
}

test("matching public meta reuses cached songs without requesting the body", async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await waitForInitialLoad(page);
    const requests = [];
    page.on("request", (request) => {
        if (/\/data\/songs(?:-meta)?\.json/.test(request.url())) requests.push(new URL(request.url()).pathname);
    });
    await page.reload();
    await waitForInitialLoad(page);
    await openSidebar(page);
    await filterBySongTitle(page, "Manual Song");
    await expect(getSongCard(page, "Manual Song")).toBeVisible();
    expect(requests).toEqual(["/data/songs-meta.json"]);
});

test("timed out public json keeps the cache through later search operations", async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await waitForInitialLoad(page);
    await expect.poll(() => readCachedSongTitles(page)).toContain("Manual Song");
    const deferred = await routeDeferredSongsJsonFixture(page, createScrollableResultSongs(1));
    const requests = [];
    page.on("request", (request) => {
        if (/\/data\/songs(?:-meta)?\.json/.test(request.url())) requests.push(new URL(request.url()).pathname);
    });
    await page.reload();
    await deferred.requestStarted;
    try {
        await waitForInitialLoad(page);
    } finally {
        deferred.releaseResponse();
    }
    await openSidebar(page);
    await filterBySongTitle(page, "Manual Song");
    await expect(getSongCard(page, "Manual Song")).toBeVisible();
    await expect(getSongCard(page, "Scroll Song 01")).toHaveCount(0);
    expect(await readCachedSongTitles(page)).toContain("Manual Song");
    expect(requests).toEqual(["/data/songs-meta.json", "/data/songs.json"]);
});
