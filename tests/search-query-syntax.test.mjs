import test from "node:test";
import assert from "node:assert/strict";
import {
    filterSongsByCriteria,
    isValidEmptySearchQuery,
    normalizeForSearch,
    parseSearchQuery
} from "../_build/app/lib/search-filters.mjs";

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

test("normalizeForSearch: normalizes compatible characters and repeated whitespace", () => {
    assert.equal(normalizeForSearch("  Ｆｏｏ　 \t BAR  "), "foo bar");
});

test("parseSearchQuery: ignores empty quoted phrases", () => {
    for (const query of ['""', '"   "', '"　"', '"" ""', "＂　＂"]) {
        assert.equal(isValidEmptySearchQuery(query), true, query);
        assert.deepEqual(parseSearchQuery(query).keywords, [], query);
    }

    assert.equal(isValidEmptySearchQuery('foo ""'), false);
    assert.equal(isValidEmptySearchQuery('since:2024 ""'), false);
    assert.equal(isValidEmptySearchQuery('"" until:'), false);
    assert.equal(isValidEmptySearchQuery('"'), false);
    assert.equal(isValidEmptySearchQuery("“”"), false);
});

test("parseSearchQuery: quote boundaries split adjacent search elements", () => {
    assert.deepEqual(parseSearchQuery('foo""bar').keywords, ["foo", "bar"]);
    assert.deepEqual(parseSearchQuery('foo"bar baz"qux').keywords, ["foo", "bar baz", "qux"]);

    const mixedOperator = parseSearchQuery('since:2024"foo"');
    assert.equal(mixedOperator.sinceKey, 20240101);
    assert.deepEqual(mixedOperator.keywords, ["foo"]);

    const quotedOperand = parseSearchQuery('since:"2024"');
    assert.deepEqual(quotedOperand.invalidOperators, ["since:"]);
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
    assert.equal(parseSearchQuery(String.raw`"foo\"`).hasUnterminatedQuote, true);
});

test("filterSongsByCriteria: matches normalized phrase whitespace and escaped quotes", () => {
    const rows = [
        makeRow({ title: "Foo   Bar" }),
        makeRow({ title: 'Don’t say "lazy"' })
    ];
    const selectedFormats = new Set(["配信"]);
    const whitespaceHit = filterSongsByCriteria(
        rows,
        { ...BASE_SEARCH_STATE, queryRaw: '"  foo   bar  "' },
        selectedFormats
    );
    const quoteHit = filterSongsByCriteria(
        rows,
        { ...BASE_SEARCH_STATE, queryRaw: String.raw`"Don’t say \"lazy\""` },
        selectedFormats
    );

    assert.deepEqual(whitespaceHit.map((row) => row.titleNorm), ["foo bar"]);
    assert.deepEqual(quoteHit.map((row) => row.titleNorm), ['don’t say "lazy"']);
});
