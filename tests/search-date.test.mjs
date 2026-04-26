import test from "node:test";
import assert from "node:assert/strict";
import { createDateFilterController } from "../app/ui/date/filter.mjs";
import { pickRecommendedSongs } from "../app/lib/search-recommendation.mjs";
import {
    normalizeForSearch,
    parseDateKey,
    isWithinDateRange,
    filterSongsByCriteria,
    createSearchController
} from "../app/controllers/search.mjs";
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
        scrollResultsPaneToTop: callbacks.scrollResultsPaneToTop || (() => {})
    };
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

    const hit = filterSongsByCriteria(rows, searchState, selectedFormats);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].artistNorm, normalizeForSearch("B"));
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

    const hit = filterSongsByCriteria(rows, searchState, new Set(["歌みた"]));
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

    const hit = filterSongsByCriteria(rows, searchState, selectedFormats);
    assert.equal(hit.length, 1);
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
        INCREMENT_COUNT: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };

    const controller = createSearchController({
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
        INCREMENT_COUNT: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };

    const controller = createSearchController({
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
        INCREMENT_COUNT: 2,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };

    const controller = createSearchController({
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

test("createSearchController: recommendation mode counts オリ曲 as 歌みた", () => {
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
        INCREMENT_COUNT: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート", "切り抜き"]
    };

    const controller = createSearchController({
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
        INCREMENT_COUNT: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート", "切り抜き"]
    };

    const controller = createSearchController({
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
