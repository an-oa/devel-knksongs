import test from "node:test";
import assert from "node:assert/strict";
import { normalizeForSearch } from "../_build/app/lib/search-normalization.mjs";
import { isValidEmptySearchQuery, parseSearchQuery } from "../_build/app/lib/search-query.mjs";

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

test("parseSearchQuery: separates normalized inclusive date operators from keywords", () => {
    assert.deepEqual(
        parseSearchQuery("Star ＳＩＮＣＥ：２０２４－２－９ until:2024-12-31"),
        {
            keywords: ["star"],
            sinceKey: 20240209,
            untilKey: 20241231,
            issues: []
        }
    );
});

test("parseSearchQuery: repeated operators use the narrowest valid bounds", () => {
    assert.deepEqual(
        parseSearchQuery("since:2024-01-01 since:2024-02-01 until:2024-12-31 until:2024-11-30"),
        {
            keywords: [],
            sinceKey: 20240201,
            untilKey: 20241130,
            issues: []
        }
    );
});

test("parseSearchQuery: invalid date-like operators are reported and non-date suffixes stay keywords", () => {
    assert.deepEqual(
        parseSearchQuery("since:2024-02-30 until:today"),
        {
            keywords: ["until:today"],
            sinceKey: null,
            untilKey: null,
            issues: [{ code: "invalid-date-operator", operator: "since:2024-02-30" }]
        }
    );
});

test("parseSearchQuery: expands partial date operators to inclusive boundaries", () => {
    const cases = [
        ["since:2024", 20240101, null],
        ["since:2024-", 20240101, null],
        ["since:2024-7", 20240701, null],
        ["since:2024-07", 20240701, null],
        ["since:2024-7-", 20240701, null],
        ["since:2024-07-", 20240701, null],
        ["until:2026", null, 20261231],
        ["until:2026-", null, 20261231],
        ["until:2026-8", null, 20260831],
        ["until:2026-08", null, 20260831],
        ["until:2026-8-", null, 20260831],
        ["until:2026-08-", null, 20260831],
        ["until:2024-2", null, 20240229],
        ["until:2025-2", null, 20250228]
    ];

    for (const [query, sinceKey, untilKey] of cases) {
        const parsed = parseSearchQuery(query);
        assert.equal(parsed.sinceKey, sinceKey, query);
        assert.equal(parsed.untilKey, untilKey, query);
        assert.deepEqual(parsed.issues, [], query);
    }
});

test("parseSearchQuery: supports quoted literal phrases and reports an unclosed quote", () => {
    assert.deepEqual(
        parseSearchQuery('Star "until:2026-13" "Song until:2026" "until:"'),
        {
            keywords: ["star", "until:2026-13", "song until:2026", "until:"],
            sinceKey: null,
            untilKey: null,
            issues: []
        }
    );
    assert.deepEqual(parseSearchQuery('"Song until:2026').issues, [{ code: "unterminated-quote" }]);
});

test("parseSearchQuery: empty and impossible date-like operands stay invalid", () => {
    const parsed = parseSearchQuery("until: until:2026-13 since:2025-2-29");
    assert.deepEqual(
        parsed.issues,
        ["until:", "until:2026-13", "since:2025-2-29"].map((operator) => ({
            code: "invalid-date-operator",
            operator
        }))
    );
});

test("parseSearchQuery: non-date operator suffixes remain ordinary keywords", () => {
    const parsed = parseSearchQuery("until:なんちゃら since:hogehoge");
    assert.deepEqual(parsed.keywords, [normalizeForSearch("until:なんちゃら"), "since:hogehoge"]);
    assert.deepEqual(parsed.issues, []);
});

test("parseSearchQuery: reports a contradictory date operator range", () => {
    const parsedQuery = parseSearchQuery("since:2024-02-01 until:2024-01-31");
    assert.deepEqual(parsedQuery.issues, [{ code: "contradictory-date-range" }]);
});
