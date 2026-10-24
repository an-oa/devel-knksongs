import type { SiteLanguage } from "./site-language.mjs";

/** 表示する名前と、その名前の言語。 */
export type SongDisplayName = {
    text: string;
    lang: SiteLanguage;
};

/**
 * サイトの言語に応じて日本語名または英語名を選ぶ。英語名が空の曲は日本語名を表示する。
 * @param japanese 日本語名
 * @param english 英語名
 * @param language サイトの言語
 * @returns 表示する名前とその言語
 */
function pickDisplayName(japanese: string, english: string, language: SiteLanguage): SongDisplayName {
    if (language === "en" && english.trim() !== "") return { text: english, lang: "en" };
    return { text: japanese, lang: "ja" };
}

/**
 * サイトの言語に応じた曲名を返す。
 * @param song 曲
 * @param language サイトの言語
 * @returns 表示する曲名とその言語
 */
export function getSongDisplayTitle(
    song: Pick<Song, "title" | "titleEn">,
    language: SiteLanguage
): SongDisplayName {
    return pickDisplayName(song.title, song.titleEn, language);
}

/**
 * サイトの言語に応じたアーティスト名を返す。
 * @param song 曲
 * @param language サイトの言語
 * @returns 表示するアーティスト名とその言語
 */
export function getSongDisplayArtist(
    song: Pick<Song, "artist" | "artistEn">,
    language: SiteLanguage
): SongDisplayName {
    return pickDisplayName(song.artist, song.artistEn, language);
}
