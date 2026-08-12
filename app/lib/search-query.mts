import { getPartialDateKeyRange, normalizePartialDateParts } from "./partial-date.mjs";
import type { PartialDateKeyRange } from "./partial-date.mjs";
import { normalizeForSearch } from "./search-normalization.mjs";

export type SearchQueryIssue =
    | { code: "invalid-date-operator"; operator: string }
    | { code: "unterminated-quote" }
    | { code: "contradictory-date-range" };

export type ParsedSearchQuery = {
    keywords: string[];
    sinceKey: number | null;
    untilKey: number | null;
    issues: SearchQueryIssue[];
};

type SearchQueryToken = {
    value: string;
    isQuoted: boolean;
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
 * 正規化済み検索語を空白区切りの語と二重引用符内のフレーズへ分割する。
 * 引用符は検索要素の境界とし、引用句内では引用符とバックスラッシュのエスケープを扱う。
 * @param query 正規化済み検索語
 * @returns 検索要素と引用符の未終端状態
 */
function tokenizeSearchQuery(query: string): TokenizedSearchQuery {
    const tokens: SearchQueryToken[] = [];
    let value = "";
    let isQuoted = false;

    /** 現在構築中の検索要素を確定する。 */
    function pushToken(quoted: boolean): void {
        const normalizedValue = quoted ? value.trim() : value;
        if (normalizedValue.length > 0) tokens.push({ value: normalizedValue, isQuoted: quoted });
        value = "";
    }

    for (let index = 0; index < query.length; index++) {
        const character = query[index];
        if (isQuoted && character === "\\") {
            const nextCharacter = query[index + 1];
            if (nextCharacter === "\"" || nextCharacter === "\\") {
                value += nextCharacter;
                index++;
                continue;
            }
            value += character;
            continue;
        }
        if (character === "\"") {
            pushToken(isQuoted);
            isQuoted = !isQuoted;
            continue;
        }
        if (!isQuoted && /\s/u.test(character)) {
            pushToken(false);
            continue;
        }
        value += character;
    }
    pushToken(isQuoted);
    return { tokens, hasUnterminatedQuote: isQuoted };
}

/**
 * 年・年月・年月日の検索演算子値を包含日付範囲へ解析する。
 * @param operand 日付演算子の値
 * @returns 有効な日付範囲。無効な場合はnull
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
 * 通常キーワードとsince/until日付演算子を分離し、検索不能な問題をissuesへ集約する。
 * 同じ演算子が複数ある場合は、すべてを満たす最も狭い境界を返す。
 * 境界条件を単体テストするためexportしている。
 * @param queryRaw 入力された検索語
 * @returns 検索条件と構文上の問題
 */
export function parseSearchQuery(queryRaw: string | null | undefined): ParsedSearchQuery {
    const tokenizedQuery = tokenizeSearchQuery(normalizeForSearch(queryRaw));
    const keywords: string[] = [];
    const issues: SearchQueryIssue[] = [];
    let sinceKey: number | null = null;
    let untilKey: number | null = null;

    tokenizedQuery.tokens.forEach((token) => {
        if (token.isQuoted) {
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
            issues.push({ code: "invalid-date-operator", operator: token.value });
            return;
        }
        if (match[1] === "since") {
            sinceKey = sinceKey === null ? dateRange.minKey : Math.max(sinceKey, dateRange.minKey);
            return;
        }
        untilKey = untilKey === null ? dateRange.maxKey : Math.min(untilKey, dateRange.maxKey);
    });

    if (tokenizedQuery.hasUnterminatedQuote) issues.push({ code: "unterminated-quote" });
    if (sinceKey !== null && untilKey !== null && sinceKey > untilKey) {
        issues.push({ code: "contradictory-date-range" });
    }
    return { keywords, sinceKey, untilKey, issues };
}

/**
 * 解析済み検索語に検索を成立させない問題があるか判定する。
 * @param parsedQuery 解析済み検索語
 * @returns 問題が1件以上ある場合はtrue
 */
export function hasSearchQueryIssues(parsedQuery: ParsedSearchQuery): boolean {
    return parsedQuery.issues.length > 0;
}

/**
 * 解析済み検索語が有効で、キーワードも日付演算子も持たない実質的な空検索か判定する。
 * @param parsedQuery 解析済み検索語
 * @returns おすすめ表示に利用できる空検索の場合はtrue
 */
export function isValidEmptySearchQuery(parsedQuery: ParsedSearchQuery): boolean {
    return !hasSearchQueryIssues(parsedQuery) &&
        parsedQuery.keywords.length === 0 &&
        parsedQuery.sinceKey === null &&
        parsedQuery.untilKey === null;
}
