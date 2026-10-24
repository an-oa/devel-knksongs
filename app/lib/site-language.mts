/** 画面の文言と、曲名・アーティスト名の表記に使う言語。 */
export type SiteLanguage = "ja" | "en";

// index.html の埋め込みスクリプトも、初回描画前の言語判定で同じキーと ?lang を直接読む。
// あちらは module を import できないため、キー名や判定を変えるときは両方を揃える。
// 判定の結果が一致することは tests/inline-language-script.test.mts で確かめる。
export const SITE_LANGUAGE_STORAGE_KEY = "siteLanguage";

/** URL で言語を指定する query のキー。指定された言語は保存し、URL からは消す。英語の OGP 用の /en/ は ?lang=en で移動してくる。 */
export const SITE_LANGUAGE_QUERY_KEY = "lang";

/**
 * 値がサイトの言語か判定する。
 * @param value 判定する値
 * @returns 日本語か英語なら true
 */
function isSiteLanguage(value: string | null | undefined): value is SiteLanguage {
    return value === "en" || value === "ja";
}

/**
 * URL の query に書かれた言語を返す。日本語と英語以外の値は無視する。
 * @param search location.search の値
 * @returns 指定された言語。指定がなければ null
 */
export function parseSiteLanguageQuery(search: string): SiteLanguage | null {
    const value = new URLSearchParams(search).get(SITE_LANGUAGE_QUERY_KEY);
    return isSiteLanguage(value) ? value : null;
}

/**
 * サイトの言語を決める。指定の候補を優先度の高い順に見て、最初の日本語か英語に従う。
 * 候補がどれも使えないときは、ブラウザの優先言語が日本語なら日本語、それ以外なら英語とする。
 * 優先言語が分からないときは、HTML に書いてある日本語とする。
 * 保存は別に行うので、保存できない環境でも、指定された言語はそのまま反映できる。
 * @param candidates 優先度の高い順の候補(?lang の値、保存値、このページで選んだ言語など)。不明な値は飛ばす
 * @param preferredLanguages ブラウザの優先言語(優先度の高い順)
 * @returns サイトの言語
 */
export function resolveSiteLanguage(
    candidates: readonly (string | null | undefined)[],
    preferredLanguages: readonly string[]
): SiteLanguage {
    const chosen = candidates.find(isSiteLanguage);
    if (chosen) return chosen;
    const primary = preferredLanguages.find((tag) => tag.trim() !== "");
    if (!primary) return "ja";
    return primary.trim().toLowerCase().startsWith("ja") ? "ja" : "en";
}
