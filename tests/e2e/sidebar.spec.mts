import { test, expect } from "@playwright/test";
import { installNetworkMocks } from "./support/network-mocks.mts";
import { clickSidebarBackdrop, expectSidebarPopoverClosed, expectSidebarPopoverOpen, getControlLabel, openSidebar, openSettingsPanel, waitForInitialLoad } from "./support/ui-helpers.mts";

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
