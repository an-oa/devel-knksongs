import { test, expect } from "@playwright/test";
import { installNetworkMocks } from "./support/network-mocks.mts";
import {
    deferSongsCacheCompletion,
    observeSongsCacheDeletions,
    prepareLegacySongsCache,
    readSongsJsonCacheText
} from "./support/songs-cache.mts";
import { filterBySongTitle, getSongCard, openSidebar, waitForInitialLoad } from "./support/ui-helpers.mts";

test("initial JSON loads once while the UI bundle is still downloading", async ({ page }) => {
    await installNetworkMocks(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const jsonRequests: string[] = [];
    page.on("request", (request) => {
        if (request.url().endsWith("/data/songs.json")) jsonRequests.push(request.url());
    });
    const { promise: uiReady, resolve: releaseUi } = Promise.withResolvers<void>();
    await page.route("**/browser/bootstrap-*.mjs*", async (route) => {
        await uiReady;
        await route.continue();
    });
    try {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        expect((await page.request.get("/app/bootstrap.mjs")).status()).toBe(404);
        // データの保存まで終わっても UI の module は保留したままにする。
        await expect.poll(() => readSongsJsonCacheText(page)).not.toBeNull();
        await expect(page.locator("#searchBox")).toBeDisabled();
        await expect(page.locator(".song-card")).toHaveCount(0);
        expect(jsonRequests).toHaveLength(1);
    } finally {
        releaseUi();
    }
    await waitForInitialLoad(page);
    await openSidebar(page);
    await filterBySongTitle(page, "Manual Song");
    await expect(getSongCard(page, "Manual Song")).toBeVisible();
    expect(jsonRequests).toHaveLength(1);
    expect(errors).toEqual([]);
});

test("a ready UI waits for public meta and reuses matching cached JSON", async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await waitForInitialLoad(page);
    await expect.poll(() => readSongsJsonCacheText(page)).not.toBeNull();
    const readCacheDeletions = await observeSongsCacheDeletions(page);
    const requests: string[] = [];
    page.on("request", (request) => {
        if (/\/data\/songs(?:-meta)?\.json/.test(request.url())) requests.push(new URL(request.url()).pathname);
    });
    const { promise: metaReady, resolve: releaseMeta } = Promise.withResolvers<void>();
    await page.route("**/data/songs-meta.json*", async (route) => {
        await metaReady;
        await route.fallback();
    });
    try {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(window.knkPlaybackSettings));
        await expect.poll(() => requests.length).toBe(1);
        await expect(page.locator("#searchBox")).toBeDisabled();
        await expect(page.locator(".song-card")).toHaveCount(0);
        expect(await readCacheDeletions()).toEqual([]);
    } finally {
        releaseMeta();
    }
    await waitForInitialLoad(page);
    expect(requests).toEqual(["/data/songs-meta.json"]);
    await expect.poll(async () => (await readCacheDeletions())?.length).toBeGreaterThan(0);
});

for (const source of ["network", "legacy"]) {
    test(`initial cards and search are ready before ${source} cache write completion`, async ({ page }) => {
        await installNetworkMocks(page);
        if (source === "legacy") {
            await page.goto("/");
            await waitForInitialLoad(page);
            await expect.poll(() => readSongsJsonCacheText(page)).not.toBeNull();
            await prepareLegacySongsCache(page);
        }
        const requests: string[] = [];
        page.on("request", (request) => {
            if (/\/data\/songs(?:-meta)?\.json/.test(request.url())) requests.push(new URL(request.url()).pathname);
        });
        const cacheCompletion = await deferSongsCacheCompletion(page);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto("/");
        await cacheCompletion.waitUntilHeld();
        if (source === "legacy") {
            expect(await page.evaluate(() => localStorage.getItem("cachedSongsJson"))).not.toBeNull();
            expect(requests).toEqual(["/data/songs-meta.json"]);
        }
        try {
            await waitForInitialLoad(page);
            await openSidebar(page);
            await filterBySongTitle(page, "Manual Song");
            await expect(getSongCard(page, "Manual Song")).toBeVisible();
        } finally {
            await cacheCompletion.release();
        }
        await expect.poll(() => readSongsJsonCacheText(page)).not.toBeNull();
        if (source === "legacy") await expect.poll(() => page.evaluate(() => localStorage.getItem("cachedSongsJson"))).toBeNull();
        expect(errors).toEqual([]);
    });
}
