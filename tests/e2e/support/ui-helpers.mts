import { expect, type Page } from "@playwright/test";

/**
 * 初期データ読み込み完了まで待機する。
 */
export async function waitForInitialLoad(page: Page) {
    await expect(page.locator("#searchBox")).toBeEnabled();
    await expect(page.locator("#resultCount")).not.toHaveText("接続中...");
}

/**
 * 指定フォームコントロールを囲む label を返す。
 */
export function getControlLabel(page: Page, selector: string) {
    return page.locator(selector).locator("xpath=ancestor::label[1]");
}

/**
 * 指定フォームコントロールの label をクリックする。
 */
export async function clickControlLabel(page: Page, selector: string) {
    const controlLabel = getControlLabel(page, selector);
    await expect(controlLabel).toBeVisible();
    await controlLabel.click();
}

/**
 * 検索サイドバーを開く。
 */
export async function openSidebar(page: Page) {
    await page.locator("#open-sidebar").click();
    await expect(page.locator("#sidebar")).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator("#open-sidebar")).toHaveAttribute("aria-expanded", "true");
}

/**
 * サイドバーの設定パネルを開く。
 */
export async function openSettingsPanel(page: Page) {
    await openSidebar(page);
    await page.locator("#open-settings-panel").click();
    await expect(page.locator("#settings-sidebar-panel")).toBeVisible();
}

/**
 * 検索サイドバーを閉じて結果一覧へ戻る。
 */
export async function closeSidebar(page: Page) {
    await page.locator("#close-sidebar").click();
    await expect(page.locator("#sidebar")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#open-sidebar")).toHaveAttribute("aria-expanded", "false");
}

/**
 * サイドバー popover の backdrop 領域をクリックする。
 */
export async function clickSidebarBackdrop(page: Page) {
    await page.mouse.click(20, 100);
}

/**
 * サイドバー popover が開き、背面が inert になっていることを確認する。
 */
export async function expectSidebarPopoverOpen(page: Page) {
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
 */
export async function expectSidebarPopoverClosed(page: Page) {
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
 */
export async function ensureToggleEnabled(page: Page, selector: string) {
    const toggle = page.locator(selector);
    const switchLabel = getControlLabel(page, selector);
    await expect(switchLabel).toBeVisible();
    if (await toggle.isChecked()) return;
    await switchLabel.click();
}

/**
 * 再生設定を有効化する。
 */
export async function enablePlaybackSettings(page: Page, options?: { continuousPlayback?: boolean }) {
    const settings = options || {};
    await openSettingsPanel(page);
    await ensureToggleEnabled(page, "#thumbnail-toggle");
    if (settings.continuousPlayback) {
        await page.evaluate(() => {
            if (!window.knkPlaybackSettings) throw new Error("Playback settings API is unavailable");
            window.knkPlaybackSettings.setExperimentalPlaybackSettings(true);
        });
        await expect(page.locator("#experimental-playback-settings")).toBeVisible();
        await ensureToggleEnabled(page, "#continuous-playback-toggle");
    }
    await page.locator("#close-settings-panel").click();
    await expect(page.locator("#searchBox")).toBeVisible();
}

/**
 * 曲タイトルで結果を絞り込む。
 */
export async function filterBySongTitle(page: Page, query: string) {
    await page.locator("#searchBox").fill(query);
    await expect(page.locator("#searchBox")).toHaveValue(query);
    await closeSidebar(page);
}

/**
 * タイトルを含む結果カードを返す。
 */
export function getSongCard(page: Page, title: string) {
    return page.locator(".song-card").filter({ hasText: title });
}

/**
 * 指定した曲カードからブックマークを作成する。
 */
export async function createBookmarkFromSong(page: Page, { bookmarkName, songTitle }: { bookmarkName: string; songTitle: string }) {
    await page.locator("#searchBox").fill(songTitle);
    await expect(page.locator("#searchBox")).toHaveValue(songTitle);

    const songCard = getSongCard(page, songTitle);
    await expect(songCard).toBeVisible();

    await songCard.locator(".add-to-bookmark-btn").click();
    await expect(page.locator("#bookmark-sidebar-panel")).toBeVisible();
    await page.locator("#bookmark-panel-new-name").fill(bookmarkName);
    await page.locator("#bookmark-panel-create-btn").click();
}

/**
 * 指定名のブックマーク項目を返す。
 */
export function getBookmarkItem(page: Page, bookmarkName: string) {
    return page.locator(".bookmark-item").filter({ hasText: bookmarkName });
}

/**
 * ブックマーク通知 toast の文言と popover 表示を確認する。
 */
export async function expectBookmarkToast(page: Page, message: string) {
    const toast = page.locator(".bookmark-toast");
    await expect(toast.locator(".bookmark-toast-message")).toHaveText(message);
    await expect
        .poll(() => toast.evaluate((element) => element.matches(":popover-open")))
        .toBe(true);
    return toast;
}

/**
 * ブックマーク管理パネルを開く。
 */
export async function openBookmarkPanel(page: Page) {
    await page.locator("#open-bookmark-panel").click();
    await expect(page.locator("#bookmark-sidebar-panel")).toBeVisible();
}
