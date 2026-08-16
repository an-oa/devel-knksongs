import { test, expect } from "@playwright/test";
import {
    installNetworkMocks,
    routeSongsJsonFixture
} from "./support/mock-youtube.mjs";
import { createScrollableResultSongs } from "./support/song-fixtures.mjs";
import {
    closeSidebar,
    openSidebar,
    waitForInitialLoad
} from "./support/ui-helpers.mjs";

test.beforeEach(async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await page.evaluate(() => {
        localStorage.clear();
    });
    await page.reload();
    await waitForInitialLoad(page);
});

/**
 * スクロール可能な検索結果を読み込み、サイドバーを閉じた状態にする。
 * @param {import("@playwright/test").Page} page
 */
async function loadScrollableResults(page) {
    await routeSongsJsonFixture(page, createScrollableResultSongs(60));
    await page.reload();
    await waitForInitialLoad(page);
    await openSidebar(page);
    await page.locator("#searchBox").fill("Scroll Artist");
    await closeSidebar(page);
    await expect(page.locator(".song-card")).toHaveCount(48);
}

test("header hides on downward scroll and returns on upward scroll", async ({ page }) => {
    await loadScrollableResults(page);

    const header = page.locator(".header");
    await expect(header).not.toHaveClass(/is-auto-hidden/);

    await page.evaluate(() => window.scrollTo(0, 320));
    await expect(header).toHaveClass(/is-auto-hidden/);

    await page.evaluate(() => window.scrollBy(0, -20));
    await expect(header).not.toHaveClass(/is-auto-hidden/);

    await openSidebar(page);
    await page.evaluate(() => window.scrollBy(0, 80));
    await expect(header).not.toHaveClass(/is-auto-hidden/);

    await closeSidebar(page);
    await expect(header).not.toHaveClass(/is-auto-hidden/);

    await page.evaluate(() => window.scrollBy(0, 20));
    await expect(header).toHaveClass(/is-auto-hidden/);
});

test("Tab focus reveals the hidden header before the next frame", async ({ page }) => {
    await loadScrollableResults(page);

    const header = page.locator(".header");
    const menuButton = page.locator("#open-sidebar");
    const firstSongLink = page.locator(".song-card a").first();
    await firstSongLink.focus();
    await expect(firstSongLink).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 320));
    await expect(header).toHaveClass(/is-auto-hidden/);

    await page.evaluate(() => {
        window.headerHiddenAtKeyboardFocusFrame = null;
        document.addEventListener("focusin", (event) => {
            if (!(event.target instanceof HTMLElement) || event.target.id !== "open-sidebar") return;
            requestAnimationFrame(() => {
                window.headerHiddenAtKeyboardFocusFrame = document.querySelector(".header")
                    ?.classList.contains("is-auto-hidden") ?? null;
            });
        }, { once: true });
    });

    await page.keyboard.press("Shift+Tab");

    await expect(menuButton).toBeFocused();
    await expect.poll(() => menuButton.evaluate((element) => element.matches(":focus-visible")))
        .toBe(true);
    await expect.poll(() => page.evaluate(() => window.headerHiddenAtKeyboardFocusFrame))
        .toBe(false);
    await expect(header).not.toHaveClass(/is-auto-hidden/);

    await page.evaluate(() => window.scrollBy(0, 80));
    await expect(header).not.toHaveClass(/is-auto-hidden/);
});

test("reduced motion keeps header visibility changes but removes sliding", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadScrollableResults(page);

    const header = page.locator(".header");
    await expect.poll(() => header.evaluate((element) => getComputedStyle(element).transitionDuration))
        .toBe("0s");

    await page.evaluate(() => window.scrollTo(0, 320));
    await expect(header).toHaveClass(/is-auto-hidden/);

    await page.evaluate(() => window.scrollBy(0, -20));
    await expect(header).not.toHaveClass(/is-auto-hidden/);
});
