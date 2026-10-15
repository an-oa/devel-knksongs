import { test, expect, type Page } from "@playwright/test";
import { installNetworkMocks } from "./support/network-mocks.mts";
import { routeSongsJsonFixture } from "./support/songs-network.mts";
import { createScrollableResultSongs } from "./support/song-fixtures.mts";
import { clickSidebarBackdrop, expectSidebarPopoverClosed, expectSidebarPopoverOpen, getControlLabel, openSidebar, openSettingsPanel, waitForInitialLoad } from "./support/ui-helpers.mts";

/**
 * 日付の絞り込みを検証するため、2024/02/10・03/05・03/20 の 3 曲を用意する。
 */
function createDatedSongs() {
    const dates = [20240210, 20240305, 20240320];
    return createScrollableResultSongs(3).map((song, index) => ({
        ...song,
        dateKey: dates[index],
        date: ["2024/02/10", "2024/03/05", "2024/03/20"][index]
    }));
}

/**
 * 保存済みの検索条件から日付範囲を読む。
 */
async function readSavedDateRange(page: Page) {
    return page.evaluate(() => {
        const saved = localStorage.getItem("searchStateV1");
        if (!saved) return null;
        const { dateFrom, dateTo } = JSON.parse(saved);
        return { dateFrom, dateTo };
    });
}

test.beforeEach(async ({ page }) => {
    await installNetworkMocks(page);
    await page.goto("/");
    await page.evaluate(() => {
        localStorage.clear();
    });
    await page.reload();
    await waitForInitialLoad(page);
});

test("theme toggle syncs native color scheme", async ({ page }) => {
    await page.evaluate(() => {
        localStorage.setItem("theme", "light");
    });
    await page.reload();
    await waitForInitialLoad(page);
    await openSettingsPanel(page);

    const themeToggle = page.locator("#theme-toggle");
    const themeSwitch = getControlLabel(page, "#theme-toggle");

    await expect(themeToggle).not.toBeChecked();
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");

    await themeSwitch.click();

    await expect(themeToggle).toBeChecked();
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("theme")))
        .toBe("dark");

    await themeSwitch.click();

    await expect(themeToggle).not.toBeChecked();
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("theme")))
        .toBe("light");
});

test("date month change searches and stores the corrected selection", async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await routeSongsJsonFixture(page, createDatedSongs());
    await page.reload();
    await waitForInitialLoad(page);
    await openSidebar(page);
    await page.locator("#dateFromYear").selectOption("2024");
    await page.locator("#dateFromMonth").selectOption("02");
    await page.locator("#dateFromDay").selectOption("10");
    await page.locator("#dateFromMonth").selectOption("03");

    await expect(page.locator("#dateFromDay")).toHaveValue("");
    await expect(page.locator("#resultList .song-card")).toHaveCount(2);
    await expect(page.locator("#resultList")).toContainText("Scroll Song 02");
    await expect(page.locator("#resultList")).toContainText("Scroll Song 03");
    expect(await page.evaluate(() => {
        const saved = localStorage.getItem("searchStateV1");
        return saved ? JSON.parse(saved).dateFrom : null;
    })).toBe("2024-03");
});

test("date clear button clears only its own side and searches again", async ({ page }) => {
    await routeSongsJsonFixture(page, createDatedSongs());
    await page.reload();
    await waitForInitialLoad(page);
    await openSidebar(page);
    await page.locator("#dateFromYear").selectOption("2024");
    await page.locator("#dateFromMonth").selectOption("03");
    await page.locator("#dateToYear").selectOption("2024");
    await page.locator("#dateToMonth").selectOption("03");
    await page.locator("#dateToDay").selectOption("05");
    await expect(page.locator("#resultList .song-card")).toHaveCount(1);
    await expect(page.locator("#resultList")).toContainText("Scroll Song 02");
    await expect.poll(() => readSavedDateRange(page)).toEqual({ dateFrom: "2024-03", dateTo: "2024-03-05" });

    await page.locator("#clearDateFromBtn").click();

    await expect(page.locator("#dateFromYear")).toHaveValue("");
    await expect(page.locator("#dateFromMonth")).toHaveValue("");
    await expect(page.locator("#dateToDay")).toHaveValue("05");
    await expect(page.locator("#resultList .song-card")).toHaveCount(2);
    await expect(page.locator("#resultList")).toContainText("Scroll Song 01");
    await expect(page.locator("#resultList")).toContainText("Scroll Song 02");
    await expect.poll(() => readSavedDateRange(page)).toEqual({ dateFrom: "", dateTo: "2024-03-05" });
});

test("storage failures allow initial results and setting changes", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
        Storage.prototype.getItem = () => { throw new Error("read denied"); };
        Storage.prototype.setItem = () => { throw new Error("write denied"); };
        Storage.prototype.removeItem = () => { throw new Error("remove denied"); };
    });
    await page.reload();
    await waitForInitialLoad(page);
    await page.locator("#searchBox").fill("Artist");
    await expect(page.locator("#resultList .song-card")).toHaveCount(6);
    await openSidebar(page);
    await expect(page.locator("#dateFromYear option[value='2024']")).toHaveCount(1);
    await page.locator("#open-settings-panel").click();
    await getControlLabel(page, "#theme-toggle").click();
    const checked = await page.locator("#theme-toggle").isChecked();
    await expect(page.locator("html")).toHaveCSS("color-scheme", checked ? "dark" : "light");
    await getControlLabel(page, "#thumbnail-toggle").click();
    await expect(page.locator("#thumbnail-toggle")).toBeChecked();
    await expect(page.locator("#playback-settings-group")).toBeVisible();
    await expect(page.locator("#resultList .thumb img")).toHaveCount(6);
    expect(errors).toEqual([]);
});

test("sidebar native popover backdrop click closes and restores focus", async ({ page }) => {
    const openButton = page.locator("#open-sidebar");

    await openButton.focus();
    await expect(openButton).toBeFocused();

    await openSidebar(page);
    await expectSidebarPopoverOpen(page);

    await clickSidebarBackdrop(page);

    await expectSidebarPopoverClosed(page);
    await expect(openButton).toBeFocused();
});

test("sidebar Tab navigation stays in the active panel after switching panels", async ({ page }) => {
    await openSidebar(page);
    const states = [
        { opener: null, first: "#close-sidebar", last: "#open-settings-panel" },
        { opener: "#open-settings-panel", first: "#close-settings-panel", last: "#theme-toggle" },
        { opener: "#open-bookmark-panel", first: "#close-bookmark-panel", last: "#bookmark-panel-export-btn" }
    ];
    for (const { opener, first, last } of states) {
        if (opener) await page.locator(opener).click();
        if (opener === "#open-settings-panel") {
            await page.locator("#thumbnail-toggle").uncheck();
            await expect(page.locator("#playback-settings-group")).toBeHidden();
        }
        await page.locator(first).focus();
        await expect(page.locator(first)).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator(last)).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.locator(first)).toBeFocused();
        if (opener) {
            await page.locator(first).click();
            await expect(page.locator(opener)).toBeFocused();
        }
    }
});
