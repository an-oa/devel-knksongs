import { test, expect, type Locator, type Page } from "@playwright/test";
import { installNetworkMocks } from "./support/network-mocks.mts";
import { routeSongsJsonFixture } from "./support/songs-network.mts";
import { createScrollableResultSongs } from "./support/song-fixtures.mts";
import {
    expectSidebarPopoverClosed,
    getBookmarkItem,
    openBookmarkPanel,
    openSidebar,
    waitForInitialLoad
} from "./support/ui-helpers.mts";

const BOOKMARK_NAME = "Reorder Favorites";

type Point = { x: number; y: number };

/**
 * 指定した曲だけを登録したブックマークを保存し、選択して結果一覧へ戻る。
 * @param page 操作するページ
 * @param songs ブックマークに登録する曲
 */
async function openSeededBookmark(page: Page, songs: Song[]) {
    await installNetworkMocks(page);
    await routeSongsJsonFixture(page, songs);
    await page.goto("/");
    await page.evaluate(({ name, songKeys }) => {
        localStorage.setItem("bookmarksV1", JSON.stringify({
            version: 3,
            bookmarks: { b1: { name, songs: songKeys, createdAt: 1 } }
        }));
    }, { name: BOOKMARK_NAME, songKeys: songs.map((song) => song.bookmarkSongKey) });
    await page.reload();
    await waitForInitialLoad(page);
    await openSidebar(page);
    await openBookmarkPanel(page);
    await getBookmarkItem(page, BOOKMARK_NAME).click();
    await expect(page.locator("#resultCount")).toHaveText(`ブックマーク: ${BOOKMARK_NAME} (${songs.length} 件)`);
    await page.locator("#close-bookmark-sidebar").click();
    await expectSidebarPopoverClosed(page);
}

/**
 * 結果カードの曲名を DOM 順に返す。
 * @param page 操作するページ
 */
async function readCardTitles(page: Page) {
    return page.locator("#resultList > .song-card .title").allTextContents();
}

/**
 * 保存されたブックマークの曲順を返す。
 * @param page 操作するページ
 */
async function readSavedSongKeys(page: Page) {
    return page.evaluate(() => {
        const payload: unknown = JSON.parse(localStorage.getItem("bookmarksV1") ?? "null");
        if (payload === null || typeof payload !== "object" || !("bookmarks" in payload)) return null;
        const bookmarks: unknown = payload.bookmarks;
        if (bookmarks === null || typeof bookmarks !== "object" || !("b1" in bookmarks)) return null;
        const bookmark: unknown = bookmarks.b1;
        return bookmark !== null && typeof bookmark === "object" && "songs" in bookmark ? bookmark.songs : null;
    });
}

/**
 * 結果カードの位置と大きさを DOM 順に返す。
 * @param page 操作するページ
 */
async function readCardBoxes(page: Page) {
    return page.locator("#resultList > .song-card").evaluateAll((cards) => cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
}

/**
 * カードの上端・下端・中央の近くの点を返す。
 * @param card 対象のカード
 */
async function getCardPoints(card: Locator) {
    const box = await card.boundingBox();
    if (!box) throw new Error("The card has no bounding box");
    const x = box.x + box.width / 2;
    return {
        top: { x, y: box.y + 10 },
        bottom: { x, y: box.y + box.height - 10 },
        center: { x, y: box.y + box.height / 2 }
    };
}

/**
 * 移動元カードのハンドルを押し、指定した点を順にたどる。離すのは呼び出し元が行う。
 * @param page 操作するページ
 * @param source 移動元のカード
 * @param points たどる点
 */
async function startHandleDrag(page: Page, source: Locator, points: Point[]) {
    await source.locator(".drag-handle").hover();
    await page.mouse.down();
    for (const point of points) {
        await page.mouse.move(point.x, point.y, { steps: 8 });
    }
}

test("dragging a card by its handle moves it and saves the order", async ({ page }) => {
    const songs = createScrollableResultSongs(6);
    await openSeededBookmark(page, songs);
    const cards = page.locator("#resultList > .song-card");

    const target = await getCardPoints(cards.nth(2));
    await startHandleDrag(page, cards.nth(0), [target.center]);
    await page.mouse.up();

    await expect.poll(() => readCardTitles(page)).toEqual([
        "Scroll Song 02", "Scroll Song 03", "Scroll Song 01", "Scroll Song 04", "Scroll Song 05", "Scroll Song 06"
    ]);
    expect(await readSavedSongKeys(page)).toEqual([1, 2, 0, 3, 4, 5].map((index) => songs[index].bookmarkSongKey));
});

test("a drop right after entering another element of the target card still moves the card", async ({ page }) => {
    const songs = createScrollableResultSongs(6);
    await openSeededBookmark(page, songs);
    const cards = page.locator("#resultList > .song-card");

    // 下端の要素から上端の要素へ一度に移り、その直後に離す。
    // WebKit は、移った先の dragenter を止めていないと、このドロップを受け付けなかった。
    const target = await getCardPoints(cards.nth(2));
    await startHandleDrag(page, cards.nth(0), [target.bottom]);
    await page.mouse.move(target.top.x, target.top.y, { steps: 1 });
    await page.mouse.up();

    await expect.poll(() => readCardTitles(page)).toEqual([
        "Scroll Song 02", "Scroll Song 03", "Scroll Song 01", "Scroll Song 04", "Scroll Song 05", "Scroll Song 06"
    ]);
});

test("the drop target keeps its outline inside the card without resizing any card", async ({ page }) => {
    await openSeededBookmark(page, createScrollableResultSongs(6));
    const cards = page.locator("#resultList > .song-card");
    const boxesBefore = await readCardBoxes(page);

    // カード内の子要素の境目を何度も越える。枠が外れたり、枠でカードの大きさが変わったりしないことを確かめる。
    const target = await getCardPoints(cards.nth(2));
    await startHandleDrag(page, cards.nth(0), [target.top, target.bottom, target.center]);
    await expect(cards.nth(2)).toHaveClass(/drag-over/);
    await expect(cards.nth(2)).toHaveCSS("outline-style", "dashed");
    expect(await readCardBoxes(page)).toEqual(boxesBefore);
    await page.mouse.up();
});

test("dragging a title link neither outlines nor moves the cards", async ({ page }) => {
    await openSeededBookmark(page, createScrollableResultSongs(6));
    const cards = page.locator("#resultList > .song-card");
    const titlesBefore = await readCardTitles(page);
    const urlBefore = page.url();

    const target = await getCardPoints(cards.nth(2));
    await cards.nth(0).locator(".title").hover();
    await page.mouse.down();
    await page.mouse.move(target.center.x, target.center.y, { steps: 8 });
    await expect(cards.nth(2)).not.toHaveClass(/drag-over/);
    await page.mouse.up();

    expect(await readCardTitles(page)).toEqual(titlesBefore);
    expect(page.url()).toBe(urlBefore);
});

test("the card being dragged is not outlined while the pointer is over it", async ({ page }) => {
    await openSeededBookmark(page, createScrollableResultSongs(6));
    const cards = page.locator("#resultList > .song-card");

    // 最後は同じ要素の上で少しだけ動かし、境目を越えた直後ではない状態で確かめる。
    const source = await getCardPoints(cards.nth(0));
    await startHandleDrag(page, cards.nth(0), [source.center, { x: source.center.x + 3, y: source.center.y }]);
    await expect(cards.nth(0)).toHaveClass(/dragging/);
    await expect(cards.nth(0)).not.toHaveClass(/drag-over/);
    await page.mouse.up();
});
