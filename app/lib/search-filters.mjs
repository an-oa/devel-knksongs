import { isWithinDateRange } from "./date-key.mjs?v=19";
import { matchesFrameScope } from "./frame-scope-filter.mjs?v=19";
import { matchesSelectedFormat } from "./song-format.mjs?v=19";

/**
 * 検索比較しやすい形に文字列を正規化する。
 * @param {*} s
 */
export function normalizeForSearch(s) {
    return (s || "")
        .normalize("NFKC")
        .replace(/[\u3041-\u3096\u309D-\u309F]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60))
        .toLowerCase();
}

/**
 * クエリ・日付・形式・フラグ条件で曲一覧を絞り込む。
 * @param {*} rows
 * @param {*} searchState
 * @param {*} selectedFormats
 */
export function filterSongsByCriteria(rows, searchState, selectedFormats) {
    const queryNorm = normalizeForSearch(searchState.queryRaw);
    const keywords = queryNorm.split(/[\s\u3000]+/).filter((k) => k.length > 0);
    return rows.filter((row) => {
        const matchText = keywords.every((kw) =>
            row.titleNorm.includes(kw) ||
            row.artistNorm.includes(kw) ||
            row.titleYomiNorm.includes(kw) ||
            row.artistYomiNorm.includes(kw)
        );
        const matchDate = isWithinDateRange(row, searchState.dateFromKey, searchState.dateToKey);
        return matchText &&
            matchDate &&
            matchesSelectedFormat(row.format, selectedFormats) &&
            matchesFrameScope(row, searchState.frameScope) &&
            (!searchState.relayOnly || row.isRelay) &&
            (!searchState.harmonyOnly || row.isHarmony);
    });
}
