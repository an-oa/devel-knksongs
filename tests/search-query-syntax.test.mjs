import test from "node:test";
import assert from "node:assert/strict";
import { filterSongsByCriteria } from "../_build/app/lib/search-filters.mjs";
import { normalizeForSearch } from "../_build/app/lib/search-normalization.mjs";
import { isValidEmptySearchQuery, parseSearchQuery } from "../_build/app/lib/search-query.mjs";

/**
 * 検索構文テスト用の曲行を作る。
 * @param {{ title: string, artist?: string }} input
 * @returns {Song}
 */
function makeRow(input) {
    const artist = input.artist ?? "";
    return {
        dateKey: 20240101,
        format: "配信",
        streamRole: "",
        isRelay: false,
        isHarmony: false,
        titleNorm: normalizeForSearch(input.title),
        artistNorm: normalizeForSearch(artist),
        titleYomiNorm: "",
        artistYomiNorm: ""
    };
}

const BASE_SEARCH_STATE = {
    dateFromKey: null,
    dateToKey: null,
    relayOnly: false,
    harmonyOnly: false
};

/**
 * 本番と同じく検索語を一度解析してから曲一覧を絞り込む。
 * @param {Song[]} rows
 * @param {SearchState} searchState
 * @param {Set<string>} selectedFormats
 * @returns {Song[]}
 */
function filterSongsForTest(rows, searchState, selectedFormats) {
    return filterSongsByCriteria(rows, searchState, selectedFormats, parseSearchQuery(searchState.queryRaw));
}

test("normalizeForSearch: normalizes compatible characters and repeated whitespace", () => {
    assert.equal(normalizeForSearch("  Ｆｏｏ　 \t BAR  "), "foo bar");
});

test("parseSearchQuery: ignores empty quoted phrases", () => {
    for (const query of ['""', '"   "', '"　"', '"" ""', "＂　＂"]) {
        const parsedQuery = parseSearchQuery(query);
        assert.equal(isValidEmptySearchQuery(parsedQuery), true, query);
        assert.deepEqual(parsedQuery.keywords, [], query);
    }

    assert.equal(isValidEmptySearchQuery(parseSearchQuery('foo ""')), false);
    assert.equal(isValidEmptySearchQuery(parseSearchQuery('since:2024 ""')), false);
    assert.equal(isValidEmptySearchQuery(parseSearchQuery('"" until:')), false);
    assert.equal(isValidEmptySearchQuery(parseSearchQuery('"')), false);
    assert.equal(isValidEmptySearchQuery(parseSearchQuery("“”")), false);
});

test("parseSearchQuery: quote boundaries split adjacent search elements", () => {
    assert.deepEqual(parseSearchQuery('foo""bar').keywords, ["foo", "bar"]);
    assert.deepEqual(parseSearchQuery('foo"bar baz"qux').keywords, ["foo", "bar baz", "qux"]);

    const mixedOperator = parseSearchQuery('since:2024"foo"');
    assert.equal(mixedOperator.sinceKey, 20240101);
    assert.deepEqual(mixedOperator.keywords, ["foo"]);

    const quotedOperand = parseSearchQuery('since:"2024"');
    assert.deepEqual(quotedOperand.issues, [{ code: "invalid-date-operator", operator: "since:" }]);
    assert.deepEqual(quotedOperand.keywords, ["2024"]);
    assert.deepEqual(parseSearchQuery('"since:2024"').keywords, ["since:2024"]);
});

test("parseSearchQuery: supports quoted escapes and full-width compatible syntax", () => {
    assert.deepEqual(
        parseSearchQuery(String.raw`"Don’t say \"lazy\""`).keywords,
        ['don’t say "lazy"']
    );
    assert.deepEqual(parseSearchQuery(String.raw`"foo\\bar"`).keywords, [String.raw`foo\bar`]);
    assert.deepEqual(parseSearchQuery(String.raw`"foo\bar"`).keywords, [String.raw`foo\bar`]);
    assert.deepEqual(parseSearchQuery("＂Don’t say ＼＂lazy＼＂＂").keywords, ['don’t say "lazy"']);
    assert.deepEqual(parseSearchQuery("“quoted”").keywords, ["“quoted”"]);
    assert.deepEqual(
        parseSearchQuery(String.raw`"foo\"`).issues,
        [{ code: "unterminated-quote" }]
    );
});

test("filterSongsByCriteria: matches normalized phrase whitespace and escaped quotes", () => {
    const rows = [
        makeRow({ title: "Foo   Bar" }),
        makeRow({ title: 'Don’t say "lazy"' })
    ];
    const selectedFormats = new Set(["配信"]);
    const whitespaceHit = filterSongsForTest(
        rows,
        { ...BASE_SEARCH_STATE, queryRaw: '"  foo   bar  "' },
        selectedFormats
    );
    const quoteHit = filterSongsForTest(
        rows,
        { ...BASE_SEARCH_STATE, queryRaw: String.raw`"Don’t say \"lazy\""` },
        selectedFormats
    );

    assert.deepEqual(whitespaceHit.map((row) => row.titleNorm), ["foo bar"]);
    assert.deepEqual(quoteHit.map((row) => row.titleNorm), ['don’t say "lazy"']);
});

test("filterSongsByCriteria: consumes the supplied parse result without parsing queryRaw again", () => {
    const parsedQuery = parseSearchQuery("target");
    const rows = [makeRow({ title: "Target" })];
    const hit = filterSongsByCriteria(
        rows,
        { ...BASE_SEARCH_STATE, queryRaw: "until:2026-13" },
        new Set(["配信"]),
        parsedQuery
    );

    assert.equal(hit.length, 1);
});
