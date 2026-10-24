import { isWithinDateRange } from "./date-key.mjs";
import { compactForSearch } from "./search-normalization.mjs";
import { hasSearchQueryIssues } from "./search-query.mjs";
import type { ParsedSearchQuery } from "./search-query.mjs";
import { matchesSelectedFormat } from "./song-format.mjs";
import { isGuestStreamRole, normalizeStreamRole, STREAM_ROLE_HOST } from "./stream-role.mjs";

/** 解析済み検索語と併用する、日付とフラグの絞り込み条件。 */
type SearchFilterCriteria = Pick<SearchState,
    "dateFromKey" | "dateToKey" | "collabHostOnly" | "collabGuestOnly" | "relayOnly" | "harmonyOnly"
>;

/** 曲行ごとの、記号と空白を除いた検索対象。曲データは読み込み後に変更しないため曲行をキーに使い回す。 */
const compactSearchFieldsByRow = new WeakMap<Song, string[]>();

/**
 * キーワード検索の対象にする、曲行の正規化済みフィールドを返す。
 * @param row 曲行
 * @returns 曲名・アーティスト名・読み・英名の正規化済み文字列
 */
function getSearchFields(row: Song): string[] {
    return [
        row.titleNorm,
        row.artistNorm,
        row.titleYomiNorm,
        row.artistYomiNorm,
        row.titleEnNorm,
        row.artistEnNorm,
        row.artistSortNorm
    ];
}

/**
 * 曲行の検索対象から記号と空白を除いた文字列を返す。
 * @param row 曲行
 * @returns getSearchFields と同じ順の、記号と空白を除いた文字列
 */
function getCompactSearchFields(row: Song): string[] {
    let fields = compactSearchFieldsByRow.get(row);
    if (!fields) {
        fields = getSearchFields(row).map(compactForSearch);
        compactSearchFieldsByRow.set(row, fields);
    }
    return fields;
}

/**
 * キーワードが曲行の検索対象のいずれかに部分一致するか判定する。
 * 記号と空白を除いて比べ、記号だけのキーワードは記号を残した値と比べる。
 * @param row 曲行
 * @param keyword 正規化済みのキーワード
 * @param compactKeyword keyword から記号と空白を除いた文字列
 * @returns いずれかの検索対象に含まれる場合はtrue
 */
function matchesKeyword(row: Song, keyword: string, compactKeyword: string): boolean {
    if (compactKeyword === "") {
        return getSearchFields(row).some((field) => field.includes(keyword));
    }
    return getCompactSearchFields(row).some((field) => field.includes(compactKeyword));
}

/**
 * コラボ種別フィルタの選択状態に曲行が一致するか判定する。
 * @param {{ streamRole?: string | null } | null | undefined} row
 * @param {{ collabHostOnly?: boolean, collabGuestOnly?: boolean }} searchState
 * @returns {boolean}
 */
export function matchesCollabRoleFilters(
    row: { streamRole?: string | null } | null | undefined,
    searchState: Pick<SearchState, "collabHostOnly" | "collabGuestOnly">
): boolean {
    const useHost = Boolean(searchState.collabHostOnly);
    const useGuest = Boolean(searchState.collabGuestOnly);
    if (!useHost && !useGuest) return true;
    const streamRole = row && row.streamRole;
    if (useGuest && isGuestStreamRole(streamRole)) return true;
    return useHost && normalizeStreamRole(streamRole) === STREAM_ROLE_HOST;
}

/**
 * クエリ・日付・形式・コラボ種別・フラグ条件で曲一覧を絞り込む。
 * キーワードは曲名・アーティスト名・読み・英名のいずれかに、記号と空白を除いて部分一致すればよい。
 * @param rows 絞り込む曲一覧
 * @param searchState 日付とフラグの絞り込み条件
 * @param selectedFormats 選択中の形態
 * @param parsedQuery 解析済み検索語
 * @returns 条件に一致する曲一覧
 */
export function filterSongsByCriteria(
    rows: Song[],
    searchState: SearchFilterCriteria,
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
    const keywords = parsedQuery.keywords.map((keyword) => ({
        keyword,
        compactKeyword: compactForSearch(keyword)
    }));
    return rows.filter((row) => {
        const matchText = keywords.every(({ keyword, compactKeyword }) =>
            matchesKeyword(row, keyword, compactKeyword)
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
