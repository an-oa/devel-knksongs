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
    await page.addInitScript(() => {
        window.cacheDeletions = [];
        const remove = IDBObjectStore.prototype.delete;
        IDBObjectStore.prototype.delete = function (key) {
            window.cacheDeletions.push(key);
            return remove.call(this, key);
        };
    });
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
        expect(await page.evaluate(() => window.cacheDeletions)).toEqual([]);
    } finally {
        releaseMeta();
    }
    await waitForInitialLoad(page);
    expect(requests).toEqual(["/data/songs-meta.json"]);
    await expect.poll(() => page.evaluate(() => window.cacheDeletions.length)).toBeGreaterThan(0);
});

for (const source of ["network", "legacy"]) {
    test(`initial cards and search are ready before ${source} cache write completion`, async ({ page }) => {
        await installNetworkMocks(page);
        if (source === "legacy") {
            await page.goto("/");
            await waitForInitialLoad(page);
            await expect.poll(() => readSongsJsonCacheText(page)).not.toBeNull();
            const text = await readSongsJsonCacheText(page);
            await page.evaluate(async (text) => {
                localStorage.setItem("cachedSongsJson", text);
                await new Promise((resolve, reject) => {
                    const opening = indexedDB.open("knksongs", 1);
                    opening.onerror = () => reject(opening.error);
                    opening.onsuccess = () => {
                        const db = opening.result;
                        const transaction = db.transaction("songsJsonCache", "readwrite");
                        transaction.objectStore("songsJsonCache").delete("cachedSongsJson");
                        transaction.oncomplete = () => { db.close(); resolve(); };
                        transaction.onabort = () => { db.close(); reject(transaction.error); };
                    };
                });
            }, text);
        }
        const requests = [];
        page.on("request", (request) => {
            if (/\/data\/songs(?:-meta)?\.json/.test(request.url())) requests.push(new URL(request.url()).pathname);
        });
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
            await page.evaluate(() => window.releaseCacheCompletion());
        }
        await expect.poll(() => readSongsJsonCacheText(page)).not.toBeNull();
        if (source === "legacy") await expect.poll(() => page.evaluate(() => localStorage.getItem("cachedSongsJson"))).toBeNull();
        expect(errors).toEqual([]);
    });
}
