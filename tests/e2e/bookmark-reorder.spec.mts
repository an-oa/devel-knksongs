import { test, expect, type Locator, type Page } from "@playwright/test";
import { installNetworkMocks } from "./support/network-mocks.mts";
import { routeSongsJsonFixture } from "./support/songs-network.mts";
import { createScrollableResultSongs } from "./support/song-fixtures.mts";
import { waitForMockYoutube } from "./support/mock-youtube.mts";
import {
    enablePlaybackSettings,
    expectSidebarPopoverClosed,
    getBookmarkItem,
    openBookmarkPanel,
    waitForInitialLoad
} from "./support/ui-helpers.mts";

const BOOKMARK_NAME = "Reorder Favorites";

type Point = { x: number; y: number };

/**
 * 指定した曲だけを登録したブックマークを保存し、選択して結果一覧へ戻る。
 * @param page 操作するページ
 * @param songs ブックマークに登録する曲
 * @param options thumbnails を true にすると、先にサムネイル表示を有効にする
 */
async function openSeededBookmark(page: Page, songs: Song[], options: { thumbnails?: boolean } = {}) {
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
    if (options.thumbnails) await enablePlaybackSettings(page);
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

test("dropping onto the video of a playing card moves the card and keeps the video", async ({ page }) => {
    await openSeededBookmark(page, createScrollableResultSongs(6), { thumbnails: true });
    const cards = page.locator("#resultList > .song-card");
    // 再生中のカードは並べ替えで位置が変わるので、曲キーで指す。
    const playingCard = page.locator('#resultList > .song-card[data-song-key="scroll-archive-03::1"]');
    await playingCard.locator(".thumb").click();
    await waitForMockYoutube(page);
    const video = playingCard.locator("iframe");
    await expect(video).toBeVisible();

    // 動画は別オリジンの iframe なので、ドラッグ中もイベントを受け取ると、動画の上ではカードに届かなかった。
    const videoBox = await video.boundingBox();
    if (!videoBox) throw new Error("The video has no bounding box");
    await startHandleDrag(page, cards.nth(0), [{ x: videoBox.x + videoBox.width / 2, y: videoBox.y + videoBox.height / 2 }]);
    await page.mouse.up();

    await expect.poll(() => readCardTitles(page)).toEqual([
        "Scroll Song 02", "Scroll Song 03", "Scroll Song 01", "Scroll Song 04", "Scroll Song 05", "Scroll Song 06"
    ]);
    await expect(page.locator("#resultList iframe")).toHaveCount(1);
    await expect(video).toBeVisible();
});

test("the dragged card stays semi-transparent while more cards load during the drag", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    const songs = createScrollableResultSongs(60);
    await openSeededBookmark(page, songs);
    const cards = page.locator("#resultList > .song-card");
    const initialCount = await cards.count();
    expect(initialCount).toBeLessThan(songs.length);

    const source = cards.nth(0);
    const target = await getCardPoints(cards.nth(1));
    await startHandleDrag(page, source, [target.center]);
    await expect(source).toHaveClass(/dragging/);

    // ブラウザがドラッグ中に画面の端で自動スクロールしたときと同じく、末尾まで送って続きを読み込ませる。
    await page.evaluate(() => document.getElementById("resultTailSentinel")?.scrollIntoView());
    await expect.poll(() => cards.count()).toBeGreaterThan(initialCount);
    await expect(source).toHaveClass(/dragging/);
    await expect(source).toHaveCSS("opacity", "0.5");
    await page.mouse.up();
});

/**
 * 結果カードの animate の呼び出しを、ページの中で記録し始める。
 * @param page 操作するページ
 */
async function recordCardAnimations(page: Page) {
    await page.evaluate(() => {
        window.__knkCardReorderAnimations = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (this: Element, keyframes, options) {
            if (this instanceof HTMLElement && this.classList.contains("song-card") && Array.isArray(keyframes)) {
                window.__knkCardReorderAnimations?.push({
                    songKey: this.dataset.songKey ?? "",
                    from: String(keyframes[0]?.transform ?? ""),
                    zIndex: String(keyframes[0]?.zIndex ?? "")
                });
            }
            return animate.call(this, keyframes, options);
        };
    });
}

/**
 * 記録した animate の呼び出しを取り出して記録を空にし、開始位置の移動量を読み取る。
 * @param page 操作するページ
 */
async function takeCardAnimations(page: Page) {
    const records = await page.evaluate(() => (window.__knkCardReorderAnimations ?? []).splice(0));
    return records.map((record) => {
        const match = /translate\(([^p]+)px, ([^p]+)px\)/.exec(record.from);
        return {
            songKey: record.songKey,
            dx: match ? Number(match[1]) : Number.NaN,
            dy: match ? Number(match[2]) : Number.NaN,
            zIndex: record.zIndex
        };
    });
}

/**
 * 並べ替えのスライドが終わるまで待つ。
 * スライド中のカードは位置が動いているので、続けて操作すると、測った位置がずれる。
 * @param page 操作するページ
 */
async function waitForCardSlides(page: Page) {
    await expect.poll(() => page.evaluate(() => document.getAnimations()
        .filter((animation) => animation.id === "card-reorder" && animation.playState === "running").length)).toBe(0);
}

test("dropping slides the cards between toward the gap in the dragged direction", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    const songs = createScrollableResultSongs(6);
    await openSeededBookmark(page, songs);
    const cards = page.locator("#resultList > .song-card");
    await recordCardAnimations(page);
    const keyOf = (songNumber: number) => songs[songNumber - 1].songKey;

    // 上から下へ（1 番目を 3 番目へ）：間のカードは上へ、移動元は下へスライドし、移動元だけ前面に出る。
    await startHandleDrag(page, cards.nth(0), [(await getCardPoints(cards.nth(2))).center]);
    await page.mouse.up();
    await expect.poll(() => readCardTitles(page)).toEqual([
        "Scroll Song 02", "Scroll Song 03", "Scroll Song 01", "Scroll Song 04", "Scroll Song 05", "Scroll Song 06"
    ]);
    const downward = await takeCardAnimations(page);
    expect(downward.map((slide) => slide.songKey).sort()).toEqual([keyOf(1), keyOf(2), keyOf(3)].sort());
    for (const slide of downward) expect(Math.abs(slide.dx)).toBeLessThan(1);
    expect(downward.find((slide) => slide.songKey === keyOf(2))?.dy).toBeGreaterThan(0);
    expect(downward.find((slide) => slide.songKey === keyOf(3))?.dy).toBeGreaterThan(0);
    expect(downward.find((slide) => slide.songKey === keyOf(1))).toMatchObject({ zIndex: "3" });
    expect(downward.find((slide) => slide.songKey === keyOf(1))?.dy).toBeLessThan(0);

    // 下から上へ（5 番目を 2 番目へ）：間のカードは下へ、移動元は上へスライドする。
    await waitForCardSlides(page);
    await page.mouse.move(5, 5);
    await startHandleDrag(page, cards.nth(4), [(await getCardPoints(cards.nth(1))).center]);
    await page.mouse.up();
    await expect.poll(() => readCardTitles(page)).toEqual([
        "Scroll Song 02", "Scroll Song 05", "Scroll Song 03", "Scroll Song 01", "Scroll Song 04", "Scroll Song 06"
    ]);
    const upward = await takeCardAnimations(page);
    expect(upward.map((slide) => slide.songKey).sort()).toEqual([keyOf(5), keyOf(3), keyOf(1), keyOf(4)].sort());
    for (const songNumber of [3, 1, 4]) {
        expect(upward.find((slide) => slide.songKey === keyOf(songNumber))?.dy).toBeLessThan(0);
    }
    expect(upward.find((slide) => slide.songKey === keyOf(5))).toMatchObject({ zIndex: "3" });
    expect(upward.find((slide) => slide.songKey === keyOf(5))?.dy).toBeGreaterThan(0);
});

test("with reduced motion, dropping reorders the cards without sliding", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSeededBookmark(page, createScrollableResultSongs(6));
    const cards = page.locator("#resultList > .song-card");
    await recordCardAnimations(page);

    await startHandleDrag(page, cards.nth(0), [(await getCardPoints(cards.nth(2))).center]);
    await page.mouse.up();

    await expect.poll(() => readCardTitles(page)).toEqual([
        "Scroll Song 02", "Scroll Song 03", "Scroll Song 01", "Scroll Song 04", "Scroll Song 05", "Scroll Song 06"
    ]);
    expect(await takeCardAnimations(page)).toEqual([]);
});

test("the whole card follows the pointer as the drag image", async ({ page }) => {
    const songs = createScrollableResultSongs(6);
    await openSeededBookmark(page, songs);
    const cards = page.locator("#resultList > .song-card");
    await page.evaluate(() => {
        window.__knkDragImages = [];
        const setDragImage = DataTransfer.prototype.setDragImage;
        DataTransfer.prototype.setDragImage = function (this: DataTransfer, image, x, y) {
            window.__knkDragImages?.push({
                songKey: image instanceof HTMLElement ? image.dataset.songKey ?? "" : "",
                isCard: image instanceof HTMLElement && image.classList.contains("song-card"),
                x,
                y
            });
            setDragImage.call(this, image, x, y);
        };
    });
    const sourceBox = await cards.nth(0).boundingBox();
    if (!sourceBox) throw new Error("The source card has no bounding box");

    await startHandleDrag(page, cards.nth(0), [(await getCardPoints(cards.nth(2))).center]);
    const dragImages = await page.evaluate(() => window.__knkDragImages ?? []);
    await page.mouse.up();

    // ハンドルはカードの右上にあるので、掴んだ位置を基準点にすると、像の基準点も右上寄りになる。
    expect(dragImages).toHaveLength(1);
    expect(dragImages[0]).toMatchObject({ songKey: songs[0].songKey, isCard: true });
    expect(dragImages[0].x).toBeGreaterThan(sourceBox.width / 2);
    expect(dragImages[0].x).toBeLessThanOrEqual(sourceBox.width);
    expect(dragImages[0].y).toBeGreaterThanOrEqual(0);
    expect(dragImages[0].y).toBeLessThan(sourceBox.height / 2);
});
