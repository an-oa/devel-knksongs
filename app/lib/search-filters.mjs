import { isWithinDateRange } from "./date-key.mjs?v=23";
import { matchesSelectedFormat } from "./song-format.mjs?v=23";
import { isGuestStreamRole, normalizeStreamRole, STREAM_ROLE_HOST } from "./stream-role.mjs?v=23";

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
 * コラボ種別フィルタの選択状態に曲行が一致するか判定する。
 * @param {{ streamRole?: string | null } | null | undefined} row
 * @param {{ collabHostOnly?: boolean, collabGuestOnly?: boolean }} searchState
 * @returns {boolean}
 */
export function matchesCollabRoleFilters(row, searchState) {
    const useHost = Boolean(searchState.collabHostOnly);
    const useGuest = Boolean(searchState.collabGuestOnly);
    if (!useHost && !useGuest) return true;
    const streamRole = row && row.streamRole;
    if (useGuest && isGuestStreamRole(streamRole)) return true;
    return useHost && normalizeStreamRole(streamRole) === STREAM_ROLE_HOST;
}

/**
 * クエリ・日付・形式・コラボ種別・フラグ条件で曲一覧を絞り込む。
 * @param {Array<Record<string, *>>} rows
 * @param {Record<string, *>} searchState
 * @param {Set<string>} selectedFormats
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
            matchesCollabRoleFilters(row, searchState) &&
            (!searchState.relayOnly || row.isRelay) &&
            (!searchState.harmonyOnly || row.isHarmony);
    });
}
