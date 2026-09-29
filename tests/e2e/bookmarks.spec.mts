import { test, expect } from "@playwright/test";
import { installNetworkMocks } from "./support/network-mocks.mts";
import { createBookmarkFromSong, expectBookmarkToast, getBookmarkItem, getSongCard, openBookmarkPanel, openSidebar, waitForInitialLoad } from "./support/ui-helpers.mts";

test.beforeEach(async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await page.evaluate(() => {
        localStorage.clear();
    });
    await page.reload();
    await waitForInitialLoad(page);
});

test("bookmark notification toast opens, closes, and auto-dismisses", async ({ page }) => {
    const bookmarkName = "Toast Check";
    await createBookmarkFromSong(page, {
        bookmarkName,
        songTitle: "Manual Song"
    });

    const createToast = await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」を作成し、「Manual Song」を保存しました。`
    );

    await createToast.locator(".bookmark-toast-close").click();
    await expect(createToast).toHaveCount(0);

    await openBookmarkPanel(page);
    await getBookmarkItem(page, bookmarkName).click();
    await page.locator("#close-bookmark-sidebar").click();
    await expect(page.locator("#sidebar")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#open-sidebar")).toHaveAttribute("aria-expanded", "false");

    const activeBookmarkCard = getSongCard(page, "Manual Song");
    await expect(activeBookmarkCard.locator(".remove-from-bookmark-btn")).toBeVisible();
    await activeBookmarkCard.locator(".remove-from-bookmark-btn").click();

    const removeToast = await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」から「Manual Song」を削除しました。`
    );
    await expect(removeToast).toHaveCount(0, { timeout: 6_000 });
});

test("active bookmark persists across reload", async ({ page }) => {
    const bookmarkName = "Reload Favorites";
    await createBookmarkFromSong(page, {
        bookmarkName,
        songTitle: "Manual Song"
    });

    const createToast = await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」を作成し、「Manual Song」を保存しました。`
    );
    await createToast.locator(".bookmark-toast-close").click();

    await openBookmarkPanel(page);
    const bookmarkItem = getBookmarkItem(page, bookmarkName);
    await bookmarkItem.click();
    await expect(bookmarkItem).toHaveClass(/active/);
    await expect(page.locator("#resultCount")).toHaveText(`ブックマーク: ${bookmarkName} (1 件)`);
    await expect.poll(() => page.evaluate(() => {
        const text = localStorage.getItem("searchStateV1");
        if (text === null) return null;
        const state: unknown = JSON.parse(text);
        return state !== null && typeof state === "object" && "activeBookmarkId" in state
            ? state.activeBookmarkId : null;
    })).toBeTruthy();

    await page.reload();
    await waitForInitialLoad(page);

    await expect(page.locator("#resultCount")).toHaveText(`ブックマーク: ${bookmarkName} (1 件)`);
    await openSidebar(page);
    await openBookmarkPanel(page);
    await expect(getBookmarkItem(page, bookmarkName)).toHaveClass(/active/);
});

test("bookmark deletion toast shows the deleted bookmark name", async ({ page }) => {
    const bookmarkName = "Delete Toast";
    await createBookmarkFromSong(page, {
        bookmarkName,
        songTitle: "Manual Song"
    });

    const createToast = await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」を作成し、「Manual Song」を保存しました。`
    );
    await createToast.locator(".bookmark-toast-close").click();
    await expect(createToast).toHaveCount(0);

    await openBookmarkPanel(page);

    const bookmarkItem = getBookmarkItem(page, bookmarkName);
    await expect(bookmarkItem).toBeVisible();
    await bookmarkItem.hover();
    await expect(bookmarkItem.locator(".bookmark-delete-btn")).toHaveCSS("pointer-events", "auto");

    const dialogPromise = new Promise<string>((resolve) => {
        page.once("dialog", async (dialog) => {
            const message = dialog.message();
            await dialog.accept();
            resolve(message);
        });
    });

    await bookmarkItem.locator(".bookmark-delete-btn").click();
    expect(await dialogPromise).toBe(`ブックマーク「${bookmarkName}」を削除しますか？`);

    await expectBookmarkToast(
        page,
        `ブックマーク「${bookmarkName}」を削除しました。`
    );
    await expect(bookmarkItem).toHaveCount(0);
});
