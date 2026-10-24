/**
 * 検索比較しやすい形に文字列を正規化する。
 * @param s 正規化する文字列
 * @returns 全角互換文字、ひらがな、英字大小、空白を揃えた文字列
 */
export function normalizeForSearch(s: string | null | undefined): string {
    return (s || "")
        .normalize("NFKC")
        .replace(/[\u3041-\u3096\u309D-\u309F]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60))
        .toLowerCase()
        .replace(/\s+/gu, " ")
        .trim();
}

/**
 * 正規化済みの文字列から記号と空白を除き、記号の有無を問わず部分一致できる形にする。
 * 絵文字に付く異体字セレクタ・ゼロ幅接合子・囲み記号も、記号の一部として除く。
 * これらが残ると、❤️ と ☀️ のように別の記号が同じ不可視文字だけの語として一致してしまう。
 * 長音符(ー)や踊り字(々)は文字として残る。
 * @param normalized normalizeForSearch で正規化済みの文字列
 * @returns 句読点・記号・空白・不可視の書式文字を除いた文字列
 */
export function compactForSearch(normalized: string): string {
    return normalized.replace(/[\p{P}\p{S}\p{Z}\s\p{Cf}\p{Me}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu, "");
}
