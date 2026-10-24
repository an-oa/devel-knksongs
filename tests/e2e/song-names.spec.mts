import { test, expect, type Page } from "@playwright/test";
import { normalizeForSearch } from "../../app/lib/search-normalization.mts";
import { installNetworkMocks } from "./support/network-mocks.mts";
import { routeSongsJsonFixture } from "./support/songs-network.mts";
import { createScrollableResultSongs } from "./support/song-fixtures.mts";
import { waitForInitialLoad } from "./support/ui-helpers.mts";

/**
 * 曲名・アーティスト名を差し替え、検索に使う正規化済みの値も同じ名前から作り直す。
 */
function withSongNames(song: Song, names: Pick<Song, "title" | "artist" | "titleEn" | "artistEn">): Song {
    return {
        ...song,
        ...names,
        titleYomi: names.title,
        artistYomi: names.artist,
        titleNorm: normalizeForSearch(names.title),
        artistNorm: normalizeForSearch(names.artist),
        titleYomiNorm: normalizeForSearch(names.title),
        artistYomiNorm: normalizeForSearch(names.artist),
        titleEnNorm: normalizeForSearch(names.titleEn),
        artistEnNorm: normalizeForSearch(names.artistEn),
        artistSortNorm: normalizeForSearch(names.artistEn)
    };
}

/**
 * 英語表記の切り替えを検証するため、英語表記のある曲とない曲を用意する。
 */
function createEnglishNamedSongs() {
    const [withEnglish, withoutEnglish] = createScrollableResultSongs(2);
    return [
        withSongNames(withEnglish, { title: "表記テスト アイネクライネ", artist: "米津玄師", titleEn: "Eine Kleine", artistEn: "Kenshi Yonezu" }),
        withSongNames(withoutEnglish, { title: "表記テスト 日本語だけ", artist: "歌手", titleEn: "", artistEn: "" })
    ];
}

/**
 * 保存済みの設定を消し、英語表記のある曲を読み込んで検索する。
 */
async function openWithEnglishNamedSongs(page: Page, query: string) {
    await installNetworkMocks(page);
    await routeSongsJsonFixture(page, createEnglishNamedSongs());
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await waitForInitialLoad(page);
    await page.locator("#searchBox").fill(query);
}

/** 言語ボタンで見えている文言。ボタンには両方の文言を重ねてあり、切り替え先の言語だけが見える。 */
function getVisibleLanguageLabel(page: Page) {
    return page.locator("#song-name-language-btn .language-btn-label:visible");
}

/** 英語表記のある曲のカードの曲名。表記が変わっても同じカードを指す。 */
function getEnglishCardTitle(page: Page) {
    return page.locator("#resultList .song-card .title").filter({ hasText: /アイネクライネ|Eine Kleine/ });
}

test.describe("Japanese browsers", () => {
    test.use({ locale: "ja-JP" });

    test("start with Japanese names and switch to English from the header", async ({ page }) => {
        await openWithEnglishNamedSongs(page, "表記テスト");
        const languageButton = page.locator("#song-name-language-btn");
        const englishCardTitle = getEnglishCardTitle(page);

        await expect(englishCardTitle).toHaveText("表記テスト アイネクライネ");
        await expect(getVisibleLanguageLabel(page)).toHaveText("English");
        await expect(languageButton).toHaveAttribute("lang", "en");

        await languageButton.click();

        await expect(englishCardTitle).toHaveText("Eine Kleine");
        await expect(englishCardTitle).toHaveAttribute("lang", "en");
        await expect(page.locator("#resultList .song-card .artist").filter({ hasText: "Kenshi Yonezu" })).toHaveAttribute("lang", "en");
        await expect(page.locator("#resultList .song-card .title").filter({ hasText: "日本語だけ" })).toHaveText("表記テスト 日本語だけ");
        await expect(getVisibleLanguageLabel(page)).toHaveText("日本語");
        await expect(languageButton).toHaveAttribute("lang", "ja");
        await expect
            .poll(() => page.evaluate(() => localStorage.getItem("songNameLanguage")))
            .toBe("en");

        await page.reload();
        await waitForInitialLoad(page);
        await page.locator("#searchBox").fill("Eine Kleine");
        await expect(englishCardTitle).toHaveText("Eine Kleine");
        await expect(getVisibleLanguageLabel(page)).toHaveText("日本語");
    });
});

test.describe("header layout", () => {
    test.use({ locale: "ja-JP", viewport: { width: 1280, height: 720 } });

    test("switching the language keeps the search box and the spots in place", async ({ page }) => {
        await openWithEnglishNamedSongs(page, "表記テスト");
        const readLayout = () => page.evaluate(() => [
            "#song-name-language-btn",
            "#searchBox",
            ".header-spots-wide-left",
            ".header-spots-wide-right"
        ].map((selector) => {
            const rect = document.querySelector(selector)?.getBoundingClientRect();
            return rect ? [rect.x, rect.width] : null;
        }));
        const before = await readLayout();

        await page.locator("#song-name-language-btn").click();
        await expect(getVisibleLanguageLabel(page)).toHaveText("日本語");

        expect(await readLayout()).toEqual(before);
    });
});

test.describe("English browsers", () => {
    test.use({ locale: "en-US" });

    test("start with English names without any setting", async ({ page }) => {
        await openWithEnglishNamedSongs(page, "Eine Kleine");

        await expect(getEnglishCardTitle(page)).toHaveText("Eine Kleine");
        await expect(getVisibleLanguageLabel(page)).toHaveText("日本語");
    });

    test("show the language button next to the search box on narrow screens", async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 740 });
        await openWithEnglishNamedSongs(page, "Eine Kleine");
        const languageButton = page.locator("#song-name-language-btn");

        await expect(languageButton).toBeVisible();
        const buttonBox = await languageButton.boundingBox();
        const searchBox = await page.locator("#searchBox").boundingBox();
        expect(buttonBox).not.toBeNull();
        expect(searchBox).not.toBeNull();
        if (!buttonBox || !searchBox) return;
        expect(Math.abs((buttonBox.y + buttonBox.height / 2) - (searchBox.y + searchBox.height / 2))).toBeLessThan(2);
        expect(buttonBox.x).toBeGreaterThanOrEqual(searchBox.x + searchBox.width);
        expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(360);
    });
});
