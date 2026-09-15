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
    await expect.poll(() => readSongsJsonCacheText(page)).not.toBeNull();
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

test("initial cards and search are ready before the cache write completion is delivered", async ({ page }) => {
    await installNetworkMocks(page);
    await page.addInitScript(() => {
        const put = IDBObjectStore.prototype.put;
        const completion = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete");
        IDBObjectStore.prototype.put = function (record, ...args) {
            if (typeof record?.value === "string" && this.name === "songsJsonCache") {
                Object.defineProperty(this.transaction, "oncomplete", {
                    set(handler) {
                        completion.set.call(this, (event) => {
                            window.releaseCacheCompletion = () => handler.call(this, event);
                        });
                    }
                });
            }
            return put.call(this, record, ...args);
        };
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.waitForFunction(() => typeof window.releaseCacheCompletion === "function");
    try {
        await waitForInitialLoad(page);
        await openSidebar(page);
        await filterBySongTitle(page, "Manual Song");
        await expect(getSongCard(page, "Manual Song")).toBeVisible();
    } finally {
        await page.evaluate(() => window.releaseCacheCompletion());
    }
    await expect.poll(() => readSongsJsonCacheText(page)).not.toBeNull();
    expect(errors).toEqual([]);
});
