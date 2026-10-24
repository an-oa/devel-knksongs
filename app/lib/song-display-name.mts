/** 曲名・アーティスト名の表示に使う表記。 */
export type SongNameLanguage = "ja" | "en";

/** 表示する名前と、英語表記を表示している場合の言語タグ。 */
export type SongDisplayName = {
    text: string;
    lang: "en" | null;
};

export const SONG_NAME_LANGUAGE_STORAGE_KEY = "songNameLanguage";

/**
 * 曲名・アーティスト名の表記を決める。保存値があればそれに従い、未保存や不明な値のときは
 * ブラウザの優先言語が日本語なら日本語表記、それ以外なら英語表記とする。
 * 優先言語が分からないときは、サイトの言語に合わせて日本語表記とする。
 * @param stored 保存されている値
 * @param preferredLanguages ブラウザの優先言語(優先度の高い順)
 * @returns 曲名・アーティスト名の表記
 */
export function resolveSongNameLanguage(
    stored: string | null,
    preferredLanguages: readonly string[]
): SongNameLanguage {
    if (stored === "en" || stored === "ja") return stored;
    const primary = preferredLanguages.find((tag) => tag.trim() !== "");
    if (!primary) return "ja";
    return primary.trim().toLowerCase().startsWith("ja") ? "ja" : "en";
}

/**
 * 表記に応じて日本語名または英語名を選ぶ。英語名が空の曲は日本語名を表示する。
 * @param japanese 日本語名
 * @param english 英語名
 * @param language 曲名・アーティスト名の表記
 * @returns 表示する名前と言語タグ
 */
function pickDisplayName(japanese: string, english: string, language: SongNameLanguage): SongDisplayName {
    if (language === "en" && english.trim() !== "") return { text: english, lang: "en" };
    return { text: japanese, lang: null };
}

/**
 * 表記に応じた曲名を返す。
 * @param song 曲
 * @param language 曲名・アーティスト名の表記
 * @returns 表示する曲名と言語タグ
 */
export function getSongDisplayTitle(
    song: Pick<Song, "title" | "titleEn">,
    language: SongNameLanguage
): SongDisplayName {
    return pickDisplayName(song.title, song.titleEn, language);
}

/**
 * 表記に応じたアーティスト名を返す。
 * @param song 曲
 * @param language 曲名・アーティスト名の表記
 * @returns 表示するアーティスト名と言語タグ
 */
export function getSongDisplayArtist(
    song: Pick<Song, "artist" | "artistEn">,
    language: SongNameLanguage
): SongDisplayName {
    return pickDisplayName(song.artist, song.artistEn, language);
}
