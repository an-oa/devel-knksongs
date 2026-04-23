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
 * サイドバーの設定パネルを開く。
 * @param {import("@playwright/test").Page} page
 */
export async function openSettingsPanel(page) {
    await page.locator("#open-sidebar").click();
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
}

/**
 * 指定の設定トグルを必要時だけ ON にする。
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 */
export async function ensureToggleEnabled(page, selector) {
    const toggle = page.locator(selector);
    const switchLabel = toggle.locator("xpath=ancestor::label[1]");
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
        await ensureToggleEnabled(page, "#experimental-playback-toggle");
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
