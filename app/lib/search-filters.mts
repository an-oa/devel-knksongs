import { isWithinDateRange } from "./date-key.mjs";
import { hasSearchQueryIssues } from "./search-query.mjs";
import type { ParsedSearchQuery } from "./search-query.mjs";
import { matchesSelectedFormat } from "./song-format.mjs";
import { isGuestStreamRole, normalizeStreamRole, STREAM_ROLE_HOST } from "./stream-role.mjs";

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
 * @param {Song[]} rows
 * @param {SearchState} searchState
 * @param {Set<string>} selectedFormats
 * @param parsedQuery 解析済み検索語
 * @returns {Song[]}
 */
export function filterSongsByCriteria(
    rows: Song[],
    searchState: SearchState,
    selectedFormats: Set<string>,
    parsedQuery: ParsedSearchQuery
): Song[] {
    if (hasSearchQueryIssues(parsedQuery)) return [];
    const fromKeys = [searchState.dateFromKey, parsedQuery.sinceKey]
        .filter((key): key is number => typeof key === "number");
    const toKeys = [searchState.dateToKey, parsedQuery.untilKey]
        .filter((key): key is number => typeof key === "number");
    const dateFromKey = fromKeys.length > 0 ? Math.max(...fromKeys) : null;
    const dateToKey = toKeys.length > 0 ? Math.min(...toKeys) : null;
    return rows.filter((row) => {
        const matchText = parsedQuery.keywords.every((kw) =>
            row.titleNorm.includes(kw) ||
            row.artistNorm.includes(kw) ||
            row.titleYomiNorm.includes(kw) ||
            row.artistYomiNorm.includes(kw)
        );
        const matchDate = isWithinDateRange(row, dateFromKey, dateToKey);
        return matchText &&
            matchDate &&
            matchesSelectedFormat(row.format, selectedFormats) &&
            matchesCollabRoleFilters(row, searchState) &&
            (!searchState.relayOnly || row.isRelay) &&
            (!searchState.harmonyOnly || row.isHarmony);
    });
}
