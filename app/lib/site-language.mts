/** 画面の文言と、曲名・アーティスト名の表記に使う言語。 */
export type SiteLanguage = "ja" | "en";

// index.html の埋め込みスクリプトも、初回描画前の言語判定で同じキーと ?lang を直接読む。
// あちらは module を import できないため、キー名や判定を変えるときは両方を揃える。
export const SITE_LANGUAGE_STORAGE_KEY = "siteLanguage";

/** URL で言語を指定する query のキー。指定された言語は保存し、URL からは消す。 */
export const SITE_LANGUAGE_QUERY_KEY = "lang";

/**
 * URL の query に書かれた言語を返す。日本語と英語以外の値は無視する。
 * @param search location.search の値
 * @returns 指定された言語。指定がなければ null
 */
export function parseSiteLanguageQuery(search: string): SiteLanguage | null {
    const value = new URLSearchParams(search).get(SITE_LANGUAGE_QUERY_KEY);
    return value === "en" || value === "ja" ? value : null;
}

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
