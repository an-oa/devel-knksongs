import { test, expect } from "@playwright/test";
import { installNetworkMocks, readSongsJsonCacheText } from "./support/mock-youtube.mjs";
import { filterBySongTitle, getSongCard, openSidebar, waitForInitialLoad } from "./support/ui-helpers.mjs";

test("initial JSON loads once while the UI bundle is still downloading", async ({ page }) => {
    await installNetworkMocks(page);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const jsonRequests = [];
    page.on("request", (request) => {
        if (request.url().endsWith("/data/songs.json")) jsonRequests.push(request.url());
    });
    let releaseUi;
    const uiReady = new Promise((resolve) => { releaseUi = resolve; });
    await page.route("**/browser/bootstrap-*.mjs*", async (route) => {
        await uiReady;
        await route.continue();
    });
    try {
        await page.goto("/", { waitUntil: "domcontentloaded" });
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
    const requests = [];
    page.on("request", (request) => {
        if (/\/data\/songs(?:-meta)?\.json/.test(request.url())) requests.push(new URL(request.url()).pathname);
    });
    let releaseMeta;
    const metaReady = new Promise((resolve) => { releaseMeta = resolve; });
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
    } finally {
        releaseMeta();
    }
    await waitForInitialLoad(page);
    expect(requests).toEqual(["/data/songs-meta.json"]);
});
