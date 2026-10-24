/** 画面の文言と、曲名・アーティスト名の表記に使う言語。 */
export type SiteLanguage = "ja" | "en";

export const SITE_LANGUAGE_STORAGE_KEY = "siteLanguage";

/**
 * サイトの言語を決める。保存値があればそれに従い、未保存や不明な値のときは
 * ブラウザの優先言語が日本語なら日本語、それ以外なら英語とする。
 * 優先言語が分からないときは、HTML に書いてある日本語とする。
 * @param stored 保存されている値
 * @param preferredLanguages ブラウザの優先言語(優先度の高い順)
 * @returns サイトの言語
 */
export function resolveSiteLanguage(
    stored: string | null,
    preferredLanguages: readonly string[]
): SiteLanguage {
    if (stored === "en" || stored === "ja") return stored;
    const primary = preferredLanguages.find((tag) => tag.trim() !== "");
    if (!primary) return "ja";
    return primary.trim().toLowerCase().startsWith("ja") ? "ja" : "en";
}
