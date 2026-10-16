import { test, expect, type Page } from "@playwright/test";
import { installNetworkMocks } from "./support/network-mocks.mts";
import { routeSongsJsonFixture } from "./support/songs-network.mts";
import { createScrollableResultSongs } from "./support/song-fixtures.mts";
import {
    clickControlLabel,
    closeSidebar,
    enablePlaybackSettings,
    filterBySongTitle,
    getSongCard,
    openSettingsPanel,
    waitForInitialLoad
} from "./support/ui-helpers.mts";

/** 実際の矩形で、カード同士の重なりやコンテナからのはみ出しを検証する。 */
async function expectCardsInsideLayout(page: Page) {
    await expect.poll(() => page.locator("#resultList").evaluate((list) => {
        const bounds = list.getBoundingClientRect();
        const rects = Array.from(list.querySelectorAll(".song-card"), (card) => card.getBoundingClientRect());
        return rects.every((rect, index) => (
            rect.height > 0 && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
            rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1 &&
            rects.slice(index + 1).every((other) => (
                Math.min(rect.right, other.right) - Math.max(rect.left, other.left) <= 1 ||
                Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top) <= 1
            ))
        ));
    })).toBe(true);
}

test("mobile recommendations append the same selection and retain it across column changes", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await installNetworkMocks(page);
    const songs = createScrollableResultSongs(60).map((song) => ({ ...song, format: "オリ曲" }));
    await routeSongsJsonFixture(page, songs);
    await page.goto("/");
    await waitForInitialLoad(page);
    const cards = page.locator(".song-card");
    await expect(page.locator("#resultList")).toHaveAttribute("data-layout-columns", "1");
    const initialKeys = await cards.evaluateAll((nodes) => nodes.map((node) => node.dataset.songKey));
    expect(initialKeys.length).toBeGreaterThanOrEqual(12);
    expect(initialKeys.length).toBeLessThan(48);
    await expect(cards.first()).toHaveCSS("position", "relative");
    await expectCardsInsideLayout(page);

    await page.locator("#resultTailSentinel").scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(48);
    const allKeys = await cards.evaluateAll((nodes) => nodes.map((node) => node.dataset.songKey));
    expect(allKeys.slice(0, initialKeys.length)).toEqual(initialKeys);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 1280, height: 851 });
    await expect(page.locator("#resultList")).not.toHaveAttribute("data-layout-columns", "1");
    await expect(cards.first()).toHaveCSS("position", "absolute");
    await expectCardsInsideLayout(page);
    await page.setViewportSize({ width: 393, height: 851 });
    await expect(page.locator("#resultList")).toHaveAttribute("data-layout-columns", "1");
    await expect(cards).toHaveCount(48);
    expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.dataset.songKey))).toEqual(allKeys);
    await expectCardsInsideLayout(page);
});

/** 結果カードの曲キーを表示順に返す。 */
async function readCardKeys(page: Page) {
    return page.locator(".song-card").evaluateAll((nodes) => nodes.map((node) => node.dataset.songKey));
}

test("recommendations return to 48 cards after widening and narrowing again at the top", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await installNetworkMocks(page);
    const songs = createScrollableResultSongs(200).map((song) => ({ ...song, format: "オリ曲" }));
    await routeSongsJsonFixture(page, songs);
    await page.goto("/");
    await waitForInitialLoad(page);
    const cards = page.locator(".song-card");
    await expect(cards).toHaveCount(48);
    const initialKeys = await readCardKeys(page);

    // ブラウザの表示を 25% に縮小したときと同じ広さにする。
    await page.setViewportSize({ width: 5120, height: 3200 });
    await expect.poll(() => cards.count()).toBeGreaterThan(48);
    const wideKeys = await readCardKeys(page);
    expect(wideKeys.slice(0, 48)).toEqual(initialKeys);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(cards).toHaveCount(48);
    expect(await readCardKeys(page)).toEqual(initialKeys);
    await expectCardsInsideLayout(page);

    await page.setViewportSize({ width: 5120, height: 3200 });
    await expect(cards).toHaveCount(wideKeys.length);
    expect(await readCardKeys(page)).toEqual(wideKeys);
    await expectCardsInsideLayout(page);
});

test("narrowing while scrolled keeps the cards above the screen and one screen below", async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await installNetworkMocks(page);
    const songs = createScrollableResultSongs(160).map((song) => ({ ...song, format: "オリ曲" }));
    await routeSongsJsonFixture(page, songs);
    await page.goto("/");
    await waitForInitialLoad(page);
    const cards = page.locator(".song-card");
    await expect.poll(() => cards.count()).toBeGreaterThan(48);
    const wideKeys = await readCardKeys(page);

    // おすすめは画面を埋める件数なので、カードを見積もりより高くして再配置し、スクロールできる状態を作る。
    await page.evaluate(() => {
        document.querySelectorAll<HTMLElement>("#resultList .song-card").forEach((card) => {
            card.style.minHeight = "600px";
        });
        window.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(4000);
    await page.evaluate(() => {
        const cardNodes = Array.from(document.querySelectorAll("#resultList .song-card"));
        const columnCount = Number(document.querySelector("#resultList")?.getAttribute("data-layout-columns"));
        window.scrollTo(0, window.scrollY + cardNodes[columnCount * 2].getBoundingClientRect().top);
    });

    await page.setViewportSize({ width: 393, height: 851 });
    await expect(page.locator("#resultList")).toHaveAttribute("data-layout-columns", "1");
    // 並び直した後の画面で、上へ過ぎたカードと画面 1 つ分（最低 48 件）だけが残る状態に落ち着く。
    await expect.poll(() => page.evaluate((wideCount) => {
        const cardNodes = Array.from(document.querySelectorAll("#resultList .song-card"));
        const firstUnpassedIndex = cardNodes.findIndex((card) => card.getBoundingClientRect().bottom > 0);
        const scrolledPastCount = firstUnpassedIndex === -1 ? cardNodes.length : firstUnpassedIndex;
        return cardNodes.length === Math.min(wideCount, scrolledPastCount + 48);
    }, wideKeys.length)).toBe(true);
    const narrowKeys = await readCardKeys(page);
    expect(narrowKeys.length).toBeGreaterThan(48);
    expect(narrowKeys.length).toBeLessThan(wideKeys.length);
    expect(narrowKeys).toEqual(wideKeys.slice(0, narrowKeys.length));
    await expectCardsInsideLayout(page);
});

test("single-column playback and thumbnail toggles keep natural card and list heights", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await installNetworkMocks(page);
    await page.goto("/");
    await waitForInitialLoad(page);
    await enablePlaybackSettings(page);
    await filterBySongTitle(page, "Artist");
    await expect(page.locator(".song-card")).toHaveCount(6);
    const card = getSongCard(page, "Manual Song");
    await card.locator(".thumb").click();
    await expect(card.locator("iframe")).toBeVisible();
    await expectCardsInsideLayout(page);
    await card.locator(".thumb-close-btn").click();
    await expect(card.locator("iframe")).toHaveCount(0);
    const expandedHeight = await page.locator("#resultList").evaluate((list) => list.getBoundingClientRect().height);
    await openSettingsPanel(page);
    await clickControlLabel(page, "#thumbnail-toggle");
    await page.locator("#close-settings-panel").click();
    await closeSidebar(page);
    await expect.poll(() => page.locator("#resultList").evaluate((list) => list.getBoundingClientRect().height)).toBeLessThan(expandedHeight);
    await expectCardsInsideLayout(page);
    expect(await page.locator("#resultList").evaluate((list) => list.style.height)).toBe("");
});

test("vertical playback expands its card without overlap and restores the masonry layout after closing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installNetworkMocks(page);
    const songs = createScrollableResultSongs(8);
    songs[1].videoOrientation = "vertical";
    await routeSongsJsonFixture(page, songs);
    await page.goto("/");
    await waitForInitialLoad(page);
    await enablePlaybackSettings(page);
    await filterBySongTitle(page, "Scroll Artist");
    await page.locator("#searchBox").blur();

    const cards = page.locator(".song-card");
    await expect(cards).toHaveCount(8);
    await expect(page.locator("#resultList")).not.toHaveAttribute("data-layout-columns", "1");
    await expectCardsInsideLayout(page);
    /** カードごとの配置を songKey 付きで記録する。 */
    const readPositions = () => cards.evaluateAll((nodes) => nodes.map((node) => ({
        songKey: node.dataset.songKey || "",
        top: node.style.top,
        left: node.style.left
    })));
    const before = await readPositions();

    const verticalCard = getSongCard(page, "Scroll Song 02");
    const collapsedHeight = await verticalCard.evaluate((node) => node.getBoundingClientRect().height);
    await verticalCard.locator(".thumb").click();
    await expect(verticalCard.locator("iframe")).toBeVisible();
    await expect(verticalCard.locator(".thumb")).toHaveAttribute("data-video-orientation", "vertical");
    await expect.poll(() => verticalCard.evaluate((node) => node.getBoundingClientRect().height))
        .toBeGreaterThan(collapsedHeight);
    await expectCardsInsideLayout(page);

    await verticalCard.locator(".thumb-close-btn").click();
    await expect(verticalCard.locator("iframe")).toHaveCount(0);
    await expect.poll(readPositions).toEqual(before);
    await expectCardsInsideLayout(page);
});
