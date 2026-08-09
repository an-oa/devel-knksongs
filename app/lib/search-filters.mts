import { isWithinDateRange, parseDateKey } from "./date-key.mjs";
import { matchesSelectedFormat } from "./song-format.mjs";
import { isGuestStreamRole, normalizeStreamRole, STREAM_ROLE_HOST } from "./stream-role.mjs";

type ParsedSearchQuery = {
    keywords: string[];
    sinceKey: number | null;
    untilKey: number | null;
    invalidOperators: string[];
    hasContradictoryDateRange: boolean;
};

const DATE_SEARCH_OPERATOR_PATTERN = /^(since|until):(\d{4}-\d{1,2}-\d{1,2})$/;
const DATE_SEARCH_OPERATOR_PREFIX_PATTERN = /^(since|until):/;

/**
 * 検索比較しやすい形に文字列を正規化する。
 * @param {string | null | undefined} s
 */
export function normalizeForSearch(s: string | null | undefined): string {
    return (s || "")
        .normalize("NFKC")
        .replace(/[\u3041-\u3096\u309D-\u309F]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60))
        .toLowerCase();
}

/**
 * 通常キーワードと since/until 日付演算子を分離する。
 * 同じ演算子が複数ある場合は、すべてを満たす最も狭い境界を返す。
 * 境界条件を単体テストするため export している。
 * @param {string | null | undefined} queryRaw
 * @returns {ParsedSearchQuery}
 */
export function parseSearchQuery(queryRaw: string | null | undefined): ParsedSearchQuery {
    const tokens = normalizeForSearch(queryRaw)
        .split(/[\s\u3000]+/)
        .filter((token) => token.length > 0);
    const keywords: string[] = [];
    const invalidOperators: string[] = [];
    let sinceKey: number | null = null;
    let untilKey: number | null = null;

    tokens.forEach((token) => {
        const match = DATE_SEARCH_OPERATOR_PATTERN.exec(token);
        if (!match) {
            if (DATE_SEARCH_OPERATOR_PREFIX_PATTERN.test(token)) {
                invalidOperators.push(token);
                return;
            }
            keywords.push(token);
            return;
        }
        const dateKey = parseDateKey(match[2]);
        if (dateKey === null) {
            invalidOperators.push(token);
            return;
        }
        if (match[1] === "since") {
            sinceKey = sinceKey === null ? dateKey : Math.max(sinceKey, dateKey);
            return;
        }
        untilKey = untilKey === null ? dateKey : Math.min(untilKey, dateKey);
    });

    return {
        keywords,
        sinceKey,
        untilKey,
        invalidOperators,
        hasContradictoryDateRange: sinceKey !== null && untilKey !== null && sinceKey > untilKey
    };
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
 * @param {Song[]} rows
 * @param {SearchState} searchState
 * @param {Set<string>} selectedFormats
 * @returns {Song[]}
 */
export function filterSongsByCriteria(rows, searchState, selectedFormats) {
    const parsedQuery = parseSearchQuery(searchState.queryRaw);
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
