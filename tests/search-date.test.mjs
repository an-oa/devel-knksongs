import test from "node:test";
import assert from "node:assert/strict";
import { createDateFilterController } from "../_build/app/ui/date/filter.mjs";
import { createSearchFiltersController } from "../_build/app/ui/search-filters/controller.mjs";
import { pickRecommendedSongs } from "../_build/app/lib/search-recommendation.mjs";
import { isWithinDateRange, parseDateKey } from "../_build/app/lib/date-key.mjs";
import { filterSongsByCriteria } from "../_build/app/lib/search-filters.mjs";
import { normalizeForSearch } from "../_build/app/lib/search-normalization.mjs";
import { parseSearchQuery } from "../_build/app/lib/search-query.mjs";
import {
    clearSearchQueryValidation,
    clearSearchQueryValidationIfValid,
    getSearchQueryValidationMessage,
    validateSearchQueryInput
} from "../_build/app/ui/search-query-validation.mjs";
import {
    createSearchController
} from "../_build/app/controllers/search.mjs";
import { installFakeDom } from "./test-helpers.mjs";

let autoSongId = 0;

/**
 * 日付コントローラー検証用の UI 状態を作る。
 * @returns {*}
 */
function createDateUiState() {
    return {
        el: {
            dateFromYear: document.createElement("select"),
            dateFromMonth: document.createElement("select"),
            dateFromDay: document.createElement("select"),
            dateToYear: document.createElement("select"),
            dateToMonth: document.createElement("select"),
            dateToDay: document.createElement("select")
        },
        date: {
            bounds: null,
            index: null,
            pendingValues: null
        }
    };
}

/**
 * 検索コントローラー検証用の UI 状態を作る。
 * @param {*} input
 * @returns {*}
 */
function createSearchUiState(input) {
    return {
        el: input.el,
        search: {
            selectedFormats: input.selectedFormats,
            debounceId: input.debounceId ?? 0,
            recommendedCache: input.recommendedCache ?? null
        },
        date: {
            bounds: null,
            index: null,
            pendingValues: null
        },
        lookup: {
            songMapByBookmarkKey: new Map(),
            songMapByKey: new Map(),
            songMapByLegacyIndex: new Map(),
            songLookupSourceRef: null
        }
    };
}

/**
 * 検索コントローラーへ検索条件 UI controller を注入して作る。
 * @param {{ data: object, ui: object, constants: object, callbacks: object }} input
 * @returns {object}
 */
function createSearchControllerForTest(input) {
    return createSearchController({
        ...input,
        searchFiltersController: createSearchFiltersController({
            ui: input.ui,
            defaultFormats: input.constants.DEFAULT_FORMATS
        })
    });
}

function makeRow(input) {
    const title = input.title ?? "";
    const artist = input.artist ?? "";
    const titleYomi = input.titleYomi ?? "";
    const artistYomi = input.artistYomi ?? "";
    const songKey = input.songKey ?? `song-${++autoSongId}`;
    return {
        archiveId: input.archiveId ?? "",
        archiveOrder: input.archiveOrder ?? null,
        songKey,
        bookmarkSongKey: input.bookmarkSongKey ?? songKey,
        sourceIndex: input.sourceIndex ?? 0,
        dateKey: input.dateKey ?? null,
        format: input.format ?? "配信",
        streamRole: input.streamRole ?? "",
        isRelay: !!input.isRelay,
        isHarmony: !!input.isHarmony,
        titleNorm: normalizeForSearch(title),
        artistNorm: normalizeForSearch(artist),
        titleYomiNorm: normalizeForSearch(titleYomi),
        artistYomiNorm: normalizeForSearch(artistYomi)
    };
}

/**
 * 検索コントローラー用の描画コールバックを作る。
 * @param {*} input
 * @returns {*}
 */
function createSearchCallbacks(input) {
    const callbacks = input || {};
    return {
        updateDisplay: callbacks.updateDisplay || (() => {}),
        scrollResultsPaneToTop: callbacks.scrollResultsPaneToTop || (() => {}),
        getRecommendedDisplayCount: callbacks.getRecommendedDisplayCount
    };
}

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

test("parseDateKey: valid and invalid dates", () => {
    assert.equal(parseDateKey("2024-02-29"), 20240229);
    assert.equal(parseDateKey("2024/2/9"), 20240209);
    assert.equal(parseDateKey("2024-02-30"), null);
    assert.equal(parseDateKey("abc"), null);
});

test("isWithinDateRange: inclusive bounds", () => {
    const row = { dateKey: 20240115 };
    assert.equal(isWithinDateRange(row, null, null), true);
    assert.equal(isWithinDateRange(row, 20240115, 20240115), true);
    assert.equal(isWithinDateRange(row, 20240116, null), false);
    assert.equal(isWithinDateRange(row, null, 20240114), false);
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

test("search query validation: exposes errors on completion and clears them during correction", () => {
    const attributes = new Map();
    const searchBox = {
        value: "since:2024-02-30",
        validationMessage: "",
        setCustomValidity(message) {
            this.validationMessage = message;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        removeAttribute(name) {
            attributes.delete(name);
        }
    };
    const errorElement = { hidden: true, textContent: "" };

    assert.equal(validateSearchQueryInput(searchBox, errorElement), false);
    assert.match(searchBox.validationMessage, /YYYY/);
    assert.match(searchBox.validationMessage, /二重引用符/);
    assert.equal(attributes.get("aria-invalid"), "true");
    assert.equal(errorElement.hidden, false);

    clearSearchQueryValidation(searchBox, errorElement);
    assert.equal(searchBox.validationMessage, "");
    assert.equal(attributes.has("aria-invalid"), false);
    assert.equal(errorElement.hidden, true);
    assert.equal(errorElement.textContent, "");
});

test("search query validation: keeps an existing error until input becomes valid", () => {
    const attributes = new Map([["aria-invalid", "true"]]);
    const searchBox = {
        value: "until:2026-13",
        validationMessage: "existing error",
        setCustomValidity(message) {
            this.validationMessage = message;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        removeAttribute(name) {
            attributes.delete(name);
        }
    };
    const errorElement = { hidden: false, textContent: "existing error" };

    assert.equal(clearSearchQueryValidationIfValid(searchBox, errorElement), false);
    assert.equal(errorElement.hidden, false);

    searchBox.value = '"until:2026-13"';
    assert.equal(clearSearchQueryValidationIfValid(searchBox, errorElement), true);
    assert.equal(attributes.has("aria-invalid"), false);
    assert.equal(errorElement.hidden, true);
});

test("search query validation: reports an unclosed quoted phrase", () => {
    assert.match(
        getSearchQueryValidationMessage(parseSearchQuery('"Song until:2026')),
        /閉じられていません/
    );
});

test("search query validation: explains contradictory operator bounds", () => {
    assert.match(
        getSearchQueryValidationMessage(parseSearchQuery("since:2024-02-01 until:2024-01-31")),
        /since の日付は until の日付以前/
    );
});

test("search query validation: reports every issue type and deduplicates repeated date errors", () => {
    const parsedQuery = parseSearchQuery('until: until:2026-13 since:2025 until:2024 "unfinished');
    assert.deepEqual(
        parsedQuery.issues.map((issue) => issue.code),
        [
            "invalid-date-operator",
            "invalid-date-operator",
            "unterminated-quote",
            "contradictory-date-range"
        ]
    );

    const message = getSearchQueryValidationMessage(parsedQuery);
    assert.equal(message.match(/日付演算子は/g)?.length, 1);
    assert.match(message, /二重引用符が閉じられていません/);
    assert.match(message, /since の日付は until の日付以前/);
});

test("filterSongsByCriteria: query/date/format/flags", () => {
    const rows = [
        makeRow({ title: "青い月", artist: "A", dateKey: 20240110, format: "配信", isRelay: true }),
        makeRow({ title: "赤い星", artist: "B", dateKey: 20240120, format: "歌みた", isHarmony: true }),
        makeRow({ title: "白い雲", artist: "C", dateKey: 20240201, format: "ショート" })
    ];
    const selectedFormats = new Set(["配信", "歌みた"]);
    const searchState = {
        queryRaw: "赤い",
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: 20240101,
        dateToKey: 20240131
    };

    const hit = filterSongsForTest(rows, searchState, selectedFormats);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].artistNorm, normalizeForSearch("B"));
});

test("filterSongsByCriteria: date operators use inclusive bounds", () => {
    const rows = [
        makeRow({ title: "Before", dateKey: 20240109 }),
        makeRow({ title: "From", dateKey: 20240110 }),
        makeRow({ title: "To", dateKey: 20240120 }),
        makeRow({ title: "After", dateKey: 20240121 }),
        makeRow({ title: "Unknown", dateKey: null })
    ];
    const searchState = {
        queryRaw: "since:2024-1-10 until:2024-01-20",
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: null,
        dateToKey: null
    };

    const hit = filterSongsForTest(rows, searchState, new Set(["配信"]));
    assert.deepEqual(hit.map((row) => row.titleNorm), ["from", "to"]);
});

test("filterSongsByCriteria: invalid date operators return no songs", () => {
    const rows = [makeRow({ title: "Target", dateKey: 20240110 })];
    const searchState = {
        queryRaw: "target since:2024-02-30",
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: null,
        dateToKey: null
    };

    const hit = filterSongsForTest(rows, searchState, new Set(["配信"]));
    assert.deepEqual(hit, []);
});

test("filterSongsByCriteria: quoted operator-like phrases search titles and artists literally", () => {
    const rows = [
        makeRow({ title: "Song until:2026", artist: "A" }),
        makeRow({ title: "Other", artist: "since:2024-7 unit" }),
        makeRow({ title: "Until Bound", artist: "A", dateKey: 20261231 })
    ];
    const baseState = {
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: null,
        dateToKey: null
    };

    const titleHit = filterSongsForTest(
        rows,
        { ...baseState, queryRaw: '"Song until:2026"' },
        new Set(["配信"])
    );
    const artistHit = filterSongsForTest(
        rows,
        { ...baseState, queryRaw: '"since:2024-7"' },
        new Set(["配信"])
    );

    assert.deepEqual(titleHit.map((row) => row.titleNorm), ["song until:2026"]);
    assert.deepEqual(artistHit.map((row) => row.titleNorm), ["other"]);
});

test("filterSongsByCriteria: an unclosed quoted phrase returns no songs", () => {
    const rows = [makeRow({ title: "Song until:2026" })];
    const hit = filterSongsForTest(rows, {
        queryRaw: '"Song until:2026',
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: null,
        dateToKey: null
    }, new Set(["配信"]));

    assert.deepEqual(hit, []);
});

test("filterSongsByCriteria: text date operators intersect with date select bounds", () => {
    const rows = [
        makeRow({ title: "Target", dateKey: 20240110 }),
        makeRow({ title: "Target", dateKey: 20240115 }),
        makeRow({ title: "Target", dateKey: 20240120 })
    ];
    const searchState = {
        queryRaw: "target since:2024-01-01 until:2024-01-31",
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: 20240112,
        dateToKey: 20240118
    };

    const hit = filterSongsForTest(rows, searchState, new Set(["配信"]));
    assert.deepEqual(hit.map((row) => row.dateKey), [20240115]);
});

test("filterSongsByCriteria: オリ曲 is included when 歌みた is selected", () => {
    const rows = [
        makeRow({ title: "覚声", artist: "PSYBELL", dateKey: 20260315, format: "オリ曲" })
    ];
    const searchState = {
        queryRaw: "覚声",
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: null,
        dateToKey: null
    };

    const hit = filterSongsForTest(rows, searchState, new Set(["歌みた"]));
    assert.equal(hit.length, 1);
    assert.equal(hit[0].format, "オリ曲");
});

test("filterSongsByCriteria: AND keywords and harmony flag", () => {
    const rows = [
        makeRow({ title: "Star Light", artist: "Kana", dateKey: 20240101, format: "配信", isHarmony: true }),
        makeRow({ title: "Star", artist: "Kana", dateKey: 20240101, format: "配信", isHarmony: false })
    ];
    const selectedFormats = new Set(["配信"]);
    const searchState = {
        queryRaw: "star kana",
        relayOnly: false,
        harmonyOnly: true,
        dateFromKey: null,
        dateToKey: null
    };

    const hit = filterSongsForTest(rows, searchState, selectedFormats);
    assert.equal(hit.length, 1);
});

test("filterSongsByCriteria: collab role filters keep selected host and guest rows", () => {
    const rows = [
        makeRow({ title: "Solo", streamRole: "" }),
        makeRow({ title: "Host", streamRole: "ホスト" }),
        makeRow({ title: "Guest", streamRole: "ゲスト" })
    ];
    const baseState = {
        queryRaw: "",
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: null,
        dateToKey: null
    };

    const allRows = filterSongsForTest(rows, baseState, new Set(["配信"]));
    const hostRows = filterSongsForTest(rows, { ...baseState, collabHostOnly: true }, new Set(["配信"]));
    const guestRows = filterSongsForTest(rows, { ...baseState, collabGuestOnly: true }, new Set(["配信"]));
    const collabRows = filterSongsForTest(
        rows,
        { ...baseState, collabHostOnly: true, collabGuestOnly: true },
        new Set(["配信"])
    );

    assert.deepEqual(allRows.map((row) => row.titleNorm), ["solo", "host", "guest"]);
    assert.deepEqual(hostRows.map((row) => row.titleNorm), ["host"]);
    assert.deepEqual(guestRows.map((row) => row.titleNorm), ["guest"]);
    assert.deepEqual(collabRows.map((row) => row.titleNorm), ["host", "guest"]);
});

test("createDateFilterController: syncDateSelectOptions constrains end-side options by start-side selection", () => {
    const restoreDom = installFakeDom();
    try {
        const ui = createDateUiState();
        const controller = createDateFilterController({ ui });
        const rows = [
            makeRow({ dateKey: 20240210 }),
            makeRow({ dateKey: 20240215 }),
            makeRow({ dateKey: 20240305 })
        ];

        controller.applyDateInputRange(rows);
        ui.el.dateFromYear.value = "2024";
        controller.syncDateSelectOptions("from");
        ui.el.dateFromMonth.value = "03";
        controller.syncDateSelectOptions("from");
        ui.el.dateToYear.value = "2024";
        controller.syncDateSelectOptions("to");

        assert.deepEqual(getSelectValues(ui.el.dateToMonth), ["", "03"]);

        ui.el.dateToMonth.value = "03";
        controller.syncDateSelectOptions("to");

        assert.deepEqual(getSelectValues(ui.el.dateToDay), ["", "05"]);
    } finally {
        restoreDom();
    }
});

test("createDateFilterController: getDateSelectValue returns partial date values", () => {
    const restoreDom = installFakeDom();
    try {
        const ui = createDateUiState();
        const controller = createDateFilterController({ ui });

        ui.el.dateFromYear.value = "2024";
        assert.equal(controller.getDateSelectValue("from"), "2024");

        ui.el.dateFromMonth.value = "02";
        assert.equal(controller.getDateSelectValue("from"), "2024-02");

        ui.el.dateFromDay.value = "10";
        assert.equal(controller.getDateSelectValue("from"), "2024-02-10");
    } finally {
        restoreDom();
    }
});

test("createDateFilterController: applyDateSelectValue restores partial date values", () => {
    const restoreDom = installFakeDom();
    try {
        const ui = createDateUiState();
        const controller = createDateFilterController({ ui });
        const rows = [
            makeRow({ dateKey: 20240210 }),
            makeRow({ dateKey: 20240215 }),
            makeRow({ dateKey: 20240305 })
        ];

        controller.applyDateInputRange(rows);
        controller.applyDateSelectValue("from", "2024-02");
        controller.applyDateSelectValue("to", "2024");

        assert.equal(controller.getDateSelectValue("from"), "2024-02");
        assert.equal(ui.el.dateFromDay.value, "");
        assert.equal(controller.getDateSelectValue("to"), "2024");
        assert.equal(ui.el.dateToMonth.value, "");
        assert.equal(ui.el.dateToDay.value, "");

        controller.applyDateSelectValue("from", "2024-02-10");
        controller.applyDateSelectValue("from", "2024-02");
        assert.equal(controller.getDateSelectValue("from"), "2024-02");
        assert.equal(ui.el.dateFromDay.value, "");

        controller.applyDateSelectValue("to", "2024-03-05");
        controller.applyDateSelectValue("to", "2024");
        assert.equal(controller.getDateSelectValue("to"), "2024");
        assert.equal(ui.el.dateToMonth.value, "");
        assert.equal(ui.el.dateToDay.value, "");
    } finally {
        restoreDom();
    }
});

test("createDateFilterController: applyDateSelectValue rounds unavailable saved days to month precision", () => {
    const restoreDom = installFakeDom();
    try {
        const ui = createDateUiState();
        const controller = createDateFilterController({ ui });
        const rows = [
            makeRow({ dateKey: 20240210 }),
            makeRow({ dateKey: 20240220 }),
            makeRow({ dateKey: 20240305 })
        ];

        controller.applyDateInputRange(rows);
        controller.applyDateSelectValue("from", "2024-02-15");

        assert.equal(controller.getDateSelectValue("from"), "2024-02");
        assert.equal(ui.el.dateFromDay.value, "");
        assert.deepEqual(controller.getPartialDateRange("from"), {
            minKey: 20240201,
            maxKey: 20240229
        });

        controller.resetDateSelects();
        controller.applyDateSelectValue("to", "2024-02-15");

        assert.equal(controller.getDateSelectValue("to"), "2024-02");
        assert.equal(ui.el.dateToDay.value, "");
        assert.deepEqual(controller.getPartialDateRange("to"), {
            minKey: 20240201,
            maxKey: 20240229
        });
    } finally {
        restoreDom();
    }
});

test("createDateFilterController: clampDateInputsIfNeeded preserves partial opposite side with complete dates", () => {
    const restoreDom = installFakeDom();
    try {
        const ui = createDateUiState();
        const controller = createDateFilterController({ ui });
        const rows = [
            makeRow({ dateKey: 20240210 }),
            makeRow({ dateKey: 20240215 }),
            makeRow({ dateKey: 20240305 })
        ];

        controller.applyDateInputRange(rows);
        controller.applyDateSelectValue("from", "2024-02-10");

        ui.el.dateToYear.value = "2024";
        controller.clampDateInputsIfNeeded();
        controller.syncDateSelectOptions();
        assert.equal(controller.getDateSelectValue("to"), "2024");

        ui.el.dateToMonth.value = "02";
        controller.clampDateInputsIfNeeded();
        controller.syncDateSelectOptions();
        assert.equal(controller.getDateSelectValue("to"), "2024-02");

        ui.el.dateToDay.value = "15";
        controller.clampDateInputsIfNeeded();
        controller.syncDateSelectOptions();
        assert.equal(controller.getDateSelectValue("to"), "2024-02-15");

        controller.resetDateSelects();
        controller.applyDateSelectValue("to", "2024-03-05");

        ui.el.dateFromYear.value = "2024";
        controller.clampDateInputsIfNeeded();
        controller.syncDateSelectOptions();
        assert.equal(controller.getDateSelectValue("from"), "2024");

        ui.el.dateFromMonth.value = "02";
        controller.clampDateInputsIfNeeded();
        controller.syncDateSelectOptions();
        assert.equal(controller.getDateSelectValue("from"), "2024-02");

        ui.el.dateFromDay.value = "10";
        controller.clampDateInputsIfNeeded();
        controller.syncDateSelectOptions();
        assert.equal(controller.getDateSelectValue("from"), "2024-02-10");
    } finally {
        restoreDom();
    }
});

test("createDateFilterController: clampDateInputsToBounds clamps and preserves chronological order", () => {
    const restoreDom = installFakeDom();
    try {
        const ui = createDateUiState();
        const controller = createDateFilterController({ ui });
        const rows = [
            makeRow({ dateKey: 20240210 }),
            makeRow({ dateKey: 20240215 }),
            makeRow({ dateKey: 20240305 })
        ];

        controller.applyDateInputRange(rows);
        ui.el.dateFromYear.value = "2024";
        ui.el.dateFromMonth.value = "03";
        ui.el.dateFromDay.value = "05";
        ui.el.dateToYear.value = "2024";
        ui.el.dateToMonth.value = "02";
        ui.el.dateToDay.value = "15";

        controller.clampDateInputsToBounds(20240210, 20240305);

        assert.equal(controller.getDateSelectValue("from"), "2024-03-05");
        assert.equal(controller.getDateSelectValue("to"), "2024-03-05");
    } finally {
        restoreDom();
    }
});

test("createDateFilterController: clampDateInputsIfNeeded keeps partial year selection", () => {
    const restoreDom = installFakeDom();
    try {
        const ui = createDateUiState();
        const controller = createDateFilterController({ ui });
        const rows = [
            makeRow({ dateKey: 20240210 }),
            makeRow({ dateKey: 20240215 }),
            makeRow({ dateKey: 20240305 })
        ];

        controller.applyDateInputRange(rows);
        ui.el.dateFromYear.value = "2024";

        controller.clampDateInputsIfNeeded();

        assert.equal(ui.el.dateFromYear.value, "2024");
        assert.equal(ui.el.dateFromMonth.value, "");
        assert.equal(ui.el.dateFromDay.value, "");
    } finally {
        restoreDom();
    }
});

test("createDateFilterController: applyPendingDateValues restores selections and clears pending state", () => {
    const restoreDom = installFakeDom();
    try {
        const ui = createDateUiState();
        const controller = createDateFilterController({ ui });
        const rows = [
            makeRow({ dateKey: 20240210 }),
            makeRow({ dateKey: 20240215 }),
            makeRow({ dateKey: 20240305 })
        ];

        controller.applyDateInputRange(rows);
        ui.date.pendingValues = {
            from: "2024-02-10",
            to: "2024-03-05"
        };

        controller.applyPendingDateValues();

        assert.equal(controller.getDateSelectValue("from"), "2024-02-10");
        assert.equal(controller.getDateSelectValue("to"), "2024-03-05");
        assert.equal(ui.date.pendingValues, null);
    } finally {
        restoreDom();
    }
});

test("pickRecommendedSongs: prefers 歌みた rows over 配信 and ショート for the same song", () => {
    const rows = [
        makeRow({ archiveId: "a1", sourceIndex: 1, title: "群青", artist: "A", format: "配信" }),
        makeRow({ archiveId: "a2", sourceIndex: 2, title: "群青", artist: "A", format: "ショート" }),
        makeRow({ archiveId: "a3", sourceIndex: 3, title: "群青", artist: "A", format: "歌みた" })
    ];

    const picked = pickRecommendedSongs(rows, { count: 10, minPerformanceCount: 2 });

    assert.equal(picked.length, 1);
    assert.equal(picked[0].format, "歌みた");
});

test("pickRecommendedSongs: excludes ゲスト rows from recommendation candidates", () => {
    const rows = [
        makeRow({ archiveId: "a1", sourceIndex: 1, title: "群青", artist: "A", format: "配信", streamRole: "ゲスト" }),
        makeRow({ archiveId: "a2", sourceIndex: 2, title: "群青", artist: "A", format: "配信", streamRole: "ゲスト" }),
        makeRow({ archiveId: "a3", sourceIndex: 3, title: "群青", artist: "A", format: "配信", streamRole: "ゲスト" }),
        makeRow({ archiveId: "a4", sourceIndex: 4, title: "青空", artist: "B", format: "配信" }),
        makeRow({ archiveId: "a5", sourceIndex: 5, title: "青空", artist: "B", format: "配信" })
    ];

    const picked = pickRecommendedSongs(rows, { count: 10, minPerformanceCount: 2 });

    assert.equal(picked.length, 1);
    assert.equal(picked[0].titleNorm, normalizeForSearch("青空"));
    assert.notEqual(picked[0].streamRole, "ゲスト");
});

test("pickRecommendedSongs: keeps the latest row within the same archive", () => {
    const rows = [
        makeRow({ archiveId: "a1", archiveOrder: 1, sourceIndex: 1, title: "群青", artist: "A", format: "配信" }),
        makeRow({ archiveId: "a1", archiveOrder: 2, sourceIndex: 2, title: "群青", artist: "A", format: "配信" }),
        makeRow({ archiveId: "a2", archiveOrder: 1, sourceIndex: 3, title: "群青", artist: "A", format: "配信" })
    ];
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
        const picked = pickRecommendedSongs(rows, { count: 10, minPerformanceCount: 2 });

        assert.equal(picked.length, 1);
        assert.equal(picked[0].archiveId, "a1");
        assert.equal(picked[0].archiveOrder, 2);
        assert.equal(picked[0].sourceIndex, 2);
    } finally {
        Math.random = originalRandom;
    }
});

test("createSearchController: active bookmark also applies search criteria", () => {
    const rows = [
        makeRow({ songKey: "s1", sourceIndex: 1, title: "青い月", artist: "A", format: "配信" }),
        makeRow({ songKey: "s2", sourceIndex: 2, title: "赤い星", artist: "B", format: "歌みた" }),
        makeRow({ songKey: "s3", sourceIndex: 3, title: "赤い空", artist: "C", format: "配信" })
    ];
    const data = {
        allSongsRaw: rows,
        bookmarks: {
            bm1: {
                name: "検証",
                songs: ["s1", "s2"]
            }
        },
        activeBookmark: "bm1",
        currentResults: [],
        displayLimit: 0
    };
    const ui = createSearchUiState({
        el: {
            searchBox: { value: "赤い" },
            relayOnly: { checked: false },
            harmonyOnly: { checked: false },
            dateFromYear: null,
            dateFromMonth: null,
            dateFromDay: null,
            dateToYear: null,
            dateToMonth: null,
            dateToDay: null,
            resultCount: { innerText: "" }
        },
        selectedFormats: new Set(["配信"])
    });
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 1,
        RESULT_DISPLAY_BATCH_SIZE: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };

    const controller = createSearchControllerForTest({
        data,
        ui,
        constants,
        callbacks: createSearchCallbacks()
    });
    controller.search();

    assert.equal(data.currentResults.length, 0);
    assert.equal(data.displayLimit, 0);
    assert.equal(ui.el.resultCount.innerText, "ブックマーク: 検証 (0 件)");
});

test("createSearchController: direct search synchronizes restored query validation", () => {
    const attributes = new Map();
    const searchBox = {
        value: "until:2026-13",
        validationMessage: "",
        setCustomValidity(message) {
            this.validationMessage = message;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        removeAttribute(name) {
            attributes.delete(name);
        }
    };
    const searchBoxError = { hidden: true, textContent: "" };
    const data = {
        allSongsRaw: [makeRow({ title: "until:2026-13", dateKey: 20260101 })],
        bookmarks: {},
        activeBookmark: null,
        currentResults: [],
        displayLimit: 0
    };
    const ui = createSearchUiState({
        el: {
            searchBox,
            searchBoxError,
            relayOnly: { checked: false },
            harmonyOnly: { checked: false },
            dateFromYear: null,
            dateFromMonth: null,
            dateFromDay: null,
            dateToYear: null,
            dateToMonth: null,
            dateToDay: null,
            resultCount: { innerText: "" }
        },
        selectedFormats: new Set(["配信"])
    });
    const controller = createSearchControllerForTest({
        data,
        ui,
        constants: {
            RANDOM_DISPLAY_COUNT: 10,
            MIN_PERFORMANCE_FOR_RANDOM: 1,
            RESULT_DISPLAY_BATCH_SIZE: 30,
            SEARCH_DEBOUNCE_MS: 0,
            DEFAULT_FORMATS: ["配信"]
        },
        callbacks: createSearchCallbacks()
    });

    controller.search();

    assert.deepEqual(data.currentResults, []);
    assert.equal(ui.el.resultCount.innerText, "0 件がヒット");
    assert.equal(attributes.get("aria-invalid"), "true");
    assert.equal(searchBoxError.hidden, false);

    searchBox.value = '"until:2026-13"';
    controller.search();

    assert.equal(data.currentResults.length, 1);
    assert.equal(attributes.has("aria-invalid"), false);
    assert.equal(searchBoxError.hidden, true);
});

test("createSearchController: active bookmark resolves rows by bookmarkSongKey", () => {
    const rows = [
        makeRow({ songKey: "arch1::1", bookmarkSongKey: "videoA::1", sourceIndex: 1, title: "青い月", artist: "A", format: "配信" }),
        makeRow({ songKey: "arch2::2", bookmarkSongKey: "videoB::2", sourceIndex: 2, title: "赤い星", artist: "B", format: "歌みた" }),
        makeRow({ songKey: "arch3::3", bookmarkSongKey: "videoC::3", sourceIndex: 3, title: "白い空", artist: "C", format: "配信" })
    ];
    const data = {
        allSongsRaw: rows,
        bookmarks: {
            bm1: {
                name: "検証",
                songs: ["videoB::2", "videoA::1"]
            }
        },
        activeBookmark: "bm1",
        currentResults: [],
        displayLimit: 0
    };
    const ui = createSearchUiState({
        el: {
            searchBox: { value: "" },
            relayOnly: { checked: false },
            harmonyOnly: { checked: false },
            dateFromYear: null,
            dateFromMonth: null,
            dateFromDay: null,
            dateToYear: null,
            dateToMonth: null,
            dateToDay: null,
            resultCount: { innerText: "" }
        },
        selectedFormats: new Set(["配信", "歌みた"])
    });
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 1,
        RESULT_DISPLAY_BATCH_SIZE: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };

    const controller = createSearchControllerForTest({
        data,
        ui,
        constants,
        callbacks: createSearchCallbacks()
    });
    controller.search();

    assert.deepEqual(data.currentResults.map((row) => row.songKey), ["arch2::2", "arch1::1"]);
    assert.equal(ui.el.resultCount.innerText, "ブックマーク: 検証 (2 件)");
});

test("createSearchController: active bookmark uses incremental display limit", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
        makeRow({
            songKey: `s${index + 1}`,
            sourceIndex: index + 1,
            title: `曲${index + 1}`,
            artist: "A",
            format: "配信"
        })
    );
    const data = {
        allSongsRaw: rows,
        bookmarks: {
            bm1: {
                name: "検証",
                songs: rows.map((row) => row.songKey)
            }
        },
        activeBookmark: "bm1",
        currentResults: [],
        displayLimit: 0
    };
    const ui = createSearchUiState({
        el: {
            searchBox: { value: "" },
            relayOnly: { checked: false },
            harmonyOnly: { checked: false },
            dateFromYear: null,
            dateFromMonth: null,
            dateFromDay: null,
            dateToYear: null,
            dateToMonth: null,
            dateToDay: null,
            resultCount: { innerText: "" }
        },
        selectedFormats: new Set(["配信"])
    });
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 1,
        RESULT_DISPLAY_BATCH_SIZE: 2,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };

    const controller = createSearchControllerForTest({
        data,
        ui,
        constants,
        callbacks: createSearchCallbacks()
    });
    controller.search();

    assert.equal(data.currentResults.length, 5);
    assert.equal(data.displayLimit, 2);
    assert.equal(ui.el.resultCount.innerText, "ブックマーク: 検証 (5 件)");
});

test("createSearchController: an empty quoted query uses recommendation mode for オリ曲", () => {
    const rows = [
        makeRow({ archiveId: "a1", sourceIndex: 1, title: "覚声", artist: "PSYBELL", format: "オリ曲" }),
        makeRow({ archiveId: "a2", sourceIndex: 2, title: "覚声", artist: "PSYBELL", format: "オリ曲" }),
        makeRow({ archiveId: "a3", sourceIndex: 3, title: "覚声", artist: "PSYBELL", format: "オリ曲" })
    ];
    const data = {
        allSongsRaw: rows,
        bookmarks: {},
        activeBookmark: null,
        currentResults: [],
        displayLimit: 0
    };
    const ui = createSearchUiState({
        el: {
            searchBox: { value: '""' },
            relayOnly: { checked: false },
            harmonyOnly: { checked: false },
            dateFromYear: null,
            dateFromMonth: null,
            dateFromDay: null,
            dateToYear: null,
            dateToMonth: null,
            dateToDay: null,
            resultCount: { innerText: "" }
        },
        selectedFormats: new Set(["配信", "歌みた", "ショート", "切り抜き"]),
        recommendedCache: null
    });
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 3,
        RESULT_DISPLAY_BATCH_SIZE: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート", "切り抜き"]
    };

    const controller = createSearchControllerForTest({
        data,
        ui,
        constants,
        callbacks: createSearchCallbacks()
    });
    controller.search();

    assert.equal(data.currentResults.length, 1);
    assert.equal(data.currentResults[0].format, "オリ曲");
    assert.equal(ui.el.resultCount.innerText, "おすすめを表示中");
});

/**
 * セレクト要素の option 値一覧を返す。
 * @param {*} select
 */
function getSelectValues(select) {
    return select.children.map((option) => option.value);
}

test("createSearchController: single オリ曲 performance is eligible for recommendation", () => {
    const rows = [
        makeRow({ archiveId: "a1", sourceIndex: 1, title: "覚声", artist: "PSYBELL", format: "オリ曲" })
    ];
    const data = {
        allSongsRaw: rows,
        bookmarks: {},
        activeBookmark: null,
        currentResults: [],
        displayLimit: 0
    };
    const ui = createSearchUiState({
        el: {
            searchBox: { value: "" },
            relayOnly: { checked: false },
            harmonyOnly: { checked: false },
            dateFromYear: null,
            dateFromMonth: null,
            dateFromDay: null,
            dateToYear: null,
            dateToMonth: null,
            dateToDay: null,
            resultCount: { innerText: "" }
        },
        selectedFormats: new Set(["配信", "歌みた", "ショート", "切り抜き"]),
        recommendedCache: null
    });
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 3,
        RESULT_DISPLAY_BATCH_SIZE: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート", "切り抜き"]
    };

    const controller = createSearchControllerForTest({
        data,
        ui,
        constants,
        callbacks: createSearchCallbacks()
    });
    controller.search();

    assert.equal(data.currentResults.length, 1);
    assert.equal(data.currentResults[0].format, "オリ曲");
    assert.equal(ui.el.resultCount.innerText, "おすすめを表示中");
});

test("createSearchController: recommendation count expands to the responsive display count", () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
        makeRow({
            archiveId: `a${index + 1}`,
            sourceIndex: index + 1,
            title: `おすすめ${index + 1}`,
            artist: "A",
            format: "配信"
        })
    );
    const data = {
        allSongsRaw: rows,
        bookmarks: {},
        activeBookmark: null,
        currentResults: [],
        displayLimit: 0
    };
    const ui = createSearchUiState({
        el: {
            searchBox: { value: "" },
            relayOnly: { checked: false },
            harmonyOnly: { checked: false },
            dateFromYear: null,
            dateFromMonth: null,
            dateFromDay: null,
            dateToYear: null,
            dateToMonth: null,
            dateToDay: null,
            resultCount: { innerText: "" }
        },
        selectedFormats: new Set(["配信", "歌みた", "ショート"]),
        recommendedCache: null
    });
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 1,
        RESULT_DISPLAY_BATCH_SIZE: 10,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };
    let recommendedDisplayCount = 12;
    let scrollCount = 0;
    let updateCount = 0;
    const controller = createSearchControllerForTest({
        data,
        ui,
        constants,
        callbacks: createSearchCallbacks({
            getRecommendedDisplayCount: () => recommendedDisplayCount,
            updateDisplay: () => {
                updateCount += 1;
            },
            scrollResultsPaneToTop: () => {
                scrollCount += 1;
            }
        })
    });

    controller.search();
    const firstRecommendedSongs = data.currentResults.slice();
    assert.equal(data.currentResults.length, 12);
    assert.equal(data.displayLimit, 12);
    assert.equal(scrollCount, 1);
    assert.equal(updateCount, 1);

    recommendedDisplayCount = 20;
    assert.equal(controller.refreshRecommendedDisplay(), true);
    assert.equal(data.currentResults.length, 20);
    assert.equal(data.displayLimit, 20);
    assert.deepEqual(data.currentResults.slice(0, 12), firstRecommendedSongs);
    assert.equal(scrollCount, 1);
    assert.equal(updateCount, 2);

    recommendedDisplayCount = 10;
    assert.equal(controller.refreshRecommendedDisplay(), true);
    assert.equal(data.currentResults.length, 10);
    assert.equal(data.displayLimit, 10);
    assert.deepEqual(data.currentResults, firstRecommendedSongs.slice(0, 10));
    assert.equal(scrollCount, 1);
    assert.equal(updateCount, 3);

    ui.el.searchBox.value = "おすすめ1";
    assert.equal(controller.refreshRecommendedDisplay(), false);
    assert.equal(updateCount, 3);
    assert.equal(ui.el.resultCount.innerText, "おすすめを表示中");
});

test("createSearchController: recommendation expansion dedupes by recommendation song group", () => {
    const previousRandom = Math.random;
    const randomValues = [0.75, 0, 0.75, 0.75, 0];
    Math.random = () => randomValues.shift() ?? 0;
    try {
        const rows = [
            makeRow({
                archiveId: "same-a1",
                sourceIndex: 1,
                title: "同じ曲",
                artist: "A",
                songKey: "same-a1",
                format: "配信"
            }),
            makeRow({
                archiveId: "same-a2",
                sourceIndex: 2,
                title: "同じ曲",
                artist: "A",
                songKey: "same-a2",
                format: "配信"
            }),
            makeRow({
                archiveId: "other-b1",
                sourceIndex: 3,
                title: "別の曲",
                artist: "B",
                songKey: "other-b1",
                format: "配信"
            }),
            makeRow({
                archiveId: "other-b2",
                sourceIndex: 4,
                title: "別の曲",
                artist: "B",
                songKey: "other-b2",
                format: "配信"
            })
        ];
        const data = {
            allSongsRaw: rows,
            bookmarks: {},
            activeBookmark: null,
            currentResults: [],
            displayLimit: 0
        };
        const ui = createSearchUiState({
            el: {
                searchBox: { value: "" },
                relayOnly: { checked: false },
                harmonyOnly: { checked: false },
                dateFromYear: null,
                dateFromMonth: null,
                dateFromDay: null,
                dateToYear: null,
                dateToMonth: null,
                dateToDay: null,
                resultCount: { innerText: "" }
            },
            selectedFormats: new Set(["配信", "歌みた", "ショート"]),
            recommendedCache: null
        });
        const constants = {
            RANDOM_DISPLAY_COUNT: 1,
            MIN_PERFORMANCE_FOR_RANDOM: 2,
            RESULT_DISPLAY_BATCH_SIZE: 10,
            SEARCH_DEBOUNCE_MS: 0,
            DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
        };
        let recommendedDisplayCount = 1;
        const controller = createSearchControllerForTest({
            data,
            ui,
            constants,
            callbacks: createSearchCallbacks({
                getRecommendedDisplayCount: () => recommendedDisplayCount
            })
        });

        controller.search();
        assert.equal(data.currentResults.length, 1);
        assert.equal(data.currentResults[0].titleNorm, normalizeForSearch("同じ曲"));

        recommendedDisplayCount = 2;
        assert.equal(controller.refreshRecommendedDisplay(), true);

        assert.equal(data.currentResults.length, 2);
        assert.deepEqual(data.currentResults.map((row) => row.titleNorm), [
            normalizeForSearch("同じ曲"),
            normalizeForSearch("別の曲")
        ]);
    } finally {
        Math.random = previousRandom;
    }
});

test("createSearchController: recommendation count is capped by available recommendations", () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
        makeRow({
            archiveId: `cap${index + 1}`,
            sourceIndex: index + 1,
            title: `候補${index + 1}`,
            artist: "A",
            format: "配信"
        })
    );
    const data = {
        allSongsRaw: rows,
        bookmarks: {},
        activeBookmark: null,
        currentResults: [],
        displayLimit: 0
    };
    const ui = createSearchUiState({
        el: {
            searchBox: { value: "" },
            relayOnly: { checked: false },
            harmonyOnly: { checked: false },
            dateFromYear: null,
            dateFromMonth: null,
            dateFromDay: null,
            dateToYear: null,
            dateToMonth: null,
            dateToDay: null,
            resultCount: { innerText: "" }
        },
        selectedFormats: new Set(["配信", "歌みた", "ショート"]),
        recommendedCache: null
    });
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 1,
        RESULT_DISPLAY_BATCH_SIZE: 10,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };
    const controller = createSearchControllerForTest({
        data,
        ui,
        constants,
        callbacks: createSearchCallbacks({
            getRecommendedDisplayCount: () => 20
        })
    });

    controller.search();

    assert.equal(data.currentResults.length, 7);
    assert.equal(data.displayLimit, 7);
    assert.equal(ui.el.resultCount.innerText, "おすすめを表示中");
});
