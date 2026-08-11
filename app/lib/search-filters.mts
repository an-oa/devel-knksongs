import { isWithinDateRange } from "./date-key.mjs";
import { getPartialDateKeyRange, normalizePartialDateParts } from "./partial-date.mjs";
import type { PartialDateKeyRange } from "./partial-date.mjs";
import { matchesSelectedFormat } from "./song-format.mjs";
import { isGuestStreamRole, normalizeStreamRole, STREAM_ROLE_HOST } from "./stream-role.mjs";

type ParsedSearchQuery = {
    keywords: string[];
    sinceKey: number | null;
    untilKey: number | null;
    invalidOperators: string[];
    hasUnterminatedQuote: boolean;
    hasContradictoryDateRange: boolean;
};

type SearchQueryToken = {
    value: string;
    isLiteral: boolean;
};

type TokenizedSearchQuery = {
    tokens: SearchQueryToken[];
    hasUnterminatedQuote: boolean;
};

const DATE_SEARCH_OPERATOR_PREFIX_PATTERN = /^(since|until):(.*)$/;
const DATE_SEARCH_OPERATOR_CANDIDATE_PATTERN = /^[\d\-/]/;
const COMPLETE_DATE_SEARCH_OPERAND_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const MONTH_DATE_SEARCH_OPERAND_PATTERN = /^(\d{4})-(\d{1,2})-?$/;
const YEAR_DATE_SEARCH_OPERAND_PATTERN = /^(\d{4})-?$/;

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
 * 正規化済み検索語を空白区切りの語と二重引用符内のフレーズへ分割する。
 * @param {string} query
 * @returns {TokenizedSearchQuery}
 */
function tokenizeSearchQuery(query: string): TokenizedSearchQuery {
    const tokens: SearchQueryToken[] = [];
    let value = "";
    let isLiteral = false;
    let isQuoted = false;
    let hasToken = false;

    /** 現在構築中の検索語を確定する。 */
    function pushToken(): void {
        if (hasToken && value.length > 0) tokens.push({ value, isLiteral });
        value = "";
        isLiteral = false;
        hasToken = false;
    }

    for (const character of query) {
        if (character === "\"") {
            isQuoted = !isQuoted;
            isLiteral = true;
            hasToken = true;
            continue;
        }
        if (!isQuoted && /\s/u.test(character)) {
            pushToken();
            continue;
        }
        value += character;
        hasToken = true;
    }
    pushToken();
    return { tokens, hasUnterminatedQuote: isQuoted };
}

/**
 * 年・年月・年月日の検索演算子値を包含日付範囲へ解析する。
 * @param {string} operand
 * @returns {PartialDateKeyRange | null}
 */
function parseDateSearchOperand(operand: string): PartialDateKeyRange | null {
    const completeMatch = COMPLETE_DATE_SEARCH_OPERAND_PATTERN.exec(operand);
    if (completeMatch) {
        return getPartialDateKeyRange(normalizePartialDateParts({
            year: completeMatch[1],
            month: completeMatch[2],
            day: completeMatch[3]
        }));
    }
    const monthMatch = MONTH_DATE_SEARCH_OPERAND_PATTERN.exec(operand);
    if (monthMatch) {
        return getPartialDateKeyRange(normalizePartialDateParts({
            year: monthMatch[1],
            month: monthMatch[2]
        }));
    }
    const yearMatch = YEAR_DATE_SEARCH_OPERAND_PATTERN.exec(operand);
    if (!yearMatch) return null;
    return getPartialDateKeyRange(normalizePartialDateParts({ year: yearMatch[1] }));
}

/**
 * 通常キーワードと since/until 日付演算子を分離する。
 * 同じ演算子が複数ある場合は、すべてを満たす最も狭い境界を返す。
 * 境界条件を単体テストするため export している。
 * @param {string | null | undefined} queryRaw
 * @returns {ParsedSearchQuery}
 */
export function parseSearchQuery(queryRaw: string | null | undefined): ParsedSearchQuery {
    const tokenizedQuery = tokenizeSearchQuery(normalizeForSearch(queryRaw));
    const keywords: string[] = [];
    const invalidOperators: string[] = [];
    let sinceKey: number | null = null;
    let untilKey: number | null = null;

    tokenizedQuery.tokens.forEach((token) => {
        if (token.isLiteral) {
            keywords.push(token.value);
            return;
        }
        const match = DATE_SEARCH_OPERATOR_PREFIX_PATTERN.exec(token.value);
        if (!match) {
            keywords.push(token.value);
            return;
        }
        const operand = match[2];
        if (operand !== "" && !DATE_SEARCH_OPERATOR_CANDIDATE_PATTERN.test(operand)) {
            keywords.push(token.value);
            return;
        }
        const dateRange = parseDateSearchOperand(operand);
        if (dateRange === null) {
            invalidOperators.push(token.value);
            return;
        }
        if (match[1] === "since") {
            sinceKey = sinceKey === null ? dateRange.minKey : Math.max(sinceKey, dateRange.minKey);
            return;
        }
        untilKey = untilKey === null ? dateRange.maxKey : Math.min(untilKey, dateRange.maxKey);
    });

    return {
        keywords,
        sinceKey,
        untilKey,
        invalidOperators,
        hasUnterminatedQuote: tokenizedQuery.hasUnterminatedQuote,
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
    if (parsedQuery.invalidOperators.length > 0 ||
        parsedQuery.hasUnterminatedQuote ||
        parsedQuery.hasContradictoryDateRange) {
        return [];
    }
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
