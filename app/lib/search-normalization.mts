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
