import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { parseCsvToSongs } from "../../../app/lib/csv-parser.mts";
import { buildSongsJsonMetaPayload, buildSongsJsonPayload } from "../../../app/lib/songs-json.mts";
import { createSongsContentHash } from "../../../scripts/songs-content-hash.mjs";

const SONGS_JSON_ROUTE = "**/data/songs.json*";
const SONGS_META_ROUTE = "**/data/songs-meta.json*";
const csvFixturePromise = readFile(new URL("../fixtures/smoke-songs.csv", import.meta.url), "utf8");
const songsJsonFixturePromise = csvFixturePromise.then((csv) => buildSongsJsonFixture(parseCsvToSongs(csv)));

/** 曲配列からsongs.jsonとmeta.jsonの応答を作る。 */
function buildSongsJsonFixture(songs: Song[], generatedAt = "2026-08-14T00:00:00.000Z") {
    const contentHash = createSongsContentHash(songs);
    return {
        json: JSON.stringify(buildSongsJsonPayload(songs, contentHash, generatedAt)),
        meta: JSON.stringify(buildSongsJsonMetaPayload(contentHash, generatedAt))
    };
}

/** JSONとmetaのルートを置き換え、必要な場合だけJSON応答の直前に待機する。 */
async function registerSongsJsonRoutes(
    page: Page,
    fixture: ReturnType<typeof buildSongsJsonFixture>,
    beforeSongsResponse?: () => Promise<void>
): Promise<void> {
    await page.unroute(SONGS_META_ROUTE);
    await page.unroute(SONGS_JSON_ROUTE);
    await page.route(SONGS_META_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: fixture.meta
        });
    });
    await page.route(SONGS_JSON_ROUTE, async (route) => {
        if (beforeSongsResponse) await beforeSongsResponse();
        await route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: fixture.json
        });
    });
}

/** 初期表示用の曲JSON・meta・CSVをローカルfixtureへ差し替える。 */
export async function installSongsNetworkMocks(page: Page): Promise<void> {
    const csvFixture = await csvFixturePromise;
    await registerSongsJsonRoutes(page, await songsJsonFixturePromise);
    await page.route("https://docs.google.com/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/csv; charset=utf-8",
            body: csvFixture
        });
    });
}

/** テストごとに曲JSONとmetaの応答を指定曲配列へ差し替える。 */
export async function routeSongsJsonFixture(page: Page, songs: Song[]): Promise<void> {
    await registerSongsJsonRoutes(page, buildSongsJsonFixture(songs));
}

/** JSONの要求開始を通知し、テスト側が解放するまで応答を保留する。 */
export async function routeDeferredSongsJsonFixture(page: Page, songs: Song[], generatedAt = "2026-08-15T00:00:00.000Z") {
    const { promise: requestStarted, resolve: markRequestStarted } = Promise.withResolvers<void>();
    const { promise: responseRelease, resolve: releaseResponse } = Promise.withResolvers<void>();
    await registerSongsJsonRoutes(page, buildSongsJsonFixture(songs, generatedAt), async () => {
        markRequestStarted();
        await responseRelease;
    });
    return { requestStarted, releaseResponse };
}
