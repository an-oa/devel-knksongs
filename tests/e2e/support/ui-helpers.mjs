import { expect } from "@playwright/test";

/**
 * 初期データ読み込み完了まで待機する。
 * @param {import("@playwright/test").Page} page
 */
export async function waitForInitialLoad(page) {
    await expect(page.locator("#searchBox")).toBeEnabled();
    await expect(page.locator("#resultCount")).not.toHaveText("接続中...");
}

/**
 * 指定フォームコントロールを囲む label を返す。
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 * @returns {import("@playwright/test").Locator}
 */
export function getControlLabel(page, selector) {
    return page.locator(selector).locator("xpath=ancestor::label[1]");
}

/**
 * 指定フォームコントロールの label をクリックする。
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 */
export async function clickControlLabel(page, selector) {
    const controlLabel = getControlLabel(page, selector);
    await expect(controlLabel).toBeVisible();
    await controlLabel.click();
}

/**
 * 検索サイドバーを開く。
 * @param {import("@playwright/test").Page} page
 */
export async function openSidebar(page) {
    await page.locator("#open-sidebar").click();
    await expect(page.locator("#sidebar")).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator("#open-sidebar")).toHaveAttribute("aria-expanded", "true");
}

/**
 * サイドバーの設定パネルを開く。
 * @param {import("@playwright/test").Page} page
 */
export async function openSettingsPanel(page) {
    await openSidebar(page);
    await page.locator("#open-settings-panel").click();
    await expect(page.locator("#settings-sidebar-panel")).toBeVisible();
}

/**
 * 検索サイドバーを閉じて結果一覧へ戻る。
 * @param {import("@playwright/test").Page} page
 */
export async function closeSidebar(page) {
    await page.locator("#close-sidebar").click();
    await expect(page.locator("#sidebar")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#open-sidebar")).toHaveAttribute("aria-expanded", "false");
}

/**
 * サイドバー popover の backdrop 領域をクリックする。
 * @param {import("@playwright/test").Page} page
 */
export async function clickSidebarBackdrop(page) {
    await page.mouse.click(20, 100);
}

/**
 * サイドバー popover が開き、背面が inert になっていることを確認する。
 * @param {import("@playwright/test").Page} page
 */
export async function expectSidebarPopoverOpen(page) {
    const sidebar = page.locator("#sidebar");
    await expect(sidebar).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator("#open-sidebar")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".main-content")).toHaveAttribute("inert", "");
    await expect
        .poll(() => sidebar.evaluate((element) => element.matches(":popover-open")))
        .toBe(true);
}

/**
 * サイドバー popover が閉じ、背面の inert が解除されていることを確認する。
 * @param {import("@playwright/test").Page} page
 */
export async function expectSidebarPopoverClosed(page) {
    const sidebar = page.locator("#sidebar");
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#open-sidebar")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".main-content")).not.toHaveAttribute("inert", "");
    await expect
        .poll(() => sidebar.evaluate((element) => element.matches(":popover-open")))
        .toBe(false);
}

/**
 * 指定の設定トグルを必要時だけ ON にする。
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 */
export async function ensureToggleEnabled(page, selector) {
    const toggle = page.locator(selector);
    const switchLabel = getControlLabel(page, selector);
    await expect(switchLabel).toBeVisible();
    if (await toggle.isChecked()) return;
    await switchLabel.click();
}

/**
 * 再生設定を有効化する。
 * @param {import("@playwright/test").Page} page
 * @param {{ continuousPlayback?: boolean } | undefined} options
 */
export async function enablePlaybackSettings(page, options) {
    const settings = options || {};
    await openSettingsPanel(page);
    await ensureToggleEnabled(page, "#thumbnail-toggle");
    if (settings.continuousPlayback) {
        await page.evaluate(() => {
            window.knkPlaybackSettings.showExperimentalPlaybackSettings = true;
        });
        await expect(page.locator("#experimental-playback-settings")).toBeVisible();
        await ensureToggleEnabled(page, "#continuous-playback-toggle");
    }
    await page.locator("#close-settings-panel").click();
    await expect(page.locator("#searchBox")).toBeVisible();
}

/**
 * 曲タイトルで結果を絞り込む。
 * @param {import("@playwright/test").Page} page
 * @param {string} query
 */
export async function filterBySongTitle(page, query) {
    await page.locator("#searchBox").fill(query);
    await expect(page.locator("#searchBox")).toHaveValue(query);
    await closeSidebar(page);
}

/**
 * タイトルを含む結果カードを返す。
 * @param {import("@playwright/test").Page} page
 * @param {string} title
 */
export function getSongCard(page, title) {
    return page.locator(".song-card").filter({ hasText: title });
}
