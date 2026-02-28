import test from "node:test";
import assert from "node:assert/strict";
import {
    normalizeForSearch,
    parseDateKey,
    isWithinDateRange,
    filterSongsByCriteria,
    createSearchController
} from "../search.mjs";

let autoSongId = 0;

function makeRow(input) {
    const title = input.title ?? "";
    const artist = input.artist ?? "";
    const titleYomi = input.titleYomi ?? "";
    const artistYomi = input.artistYomi ?? "";
    return {
        songKey: input.songKey ?? `song-${++autoSongId}`,
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
    const ui = {
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
        selectedFormats: new Set(["配信"]),
        searchDebounceId: 0
    };
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 1,
        INCREMENT_COUNT: 30,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };

    const controller = createSearchController({ data, ui, constants });
    controller.search();

    assert.equal(data.currentResults.length, 0);
    assert.equal(data.displayLimit, 0);
    assert.equal(ui.el.resultCount.innerText, "ブックマーク: 検証 (0 件)");
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
    const ui = {
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
        selectedFormats: new Set(["配信"]),
        searchDebounceId: 0
    };
    const constants = {
        RANDOM_DISPLAY_COUNT: 10,
        MIN_PERFORMANCE_FOR_RANDOM: 1,
        INCREMENT_COUNT: 2,
        SEARCH_DEBOUNCE_MS: 0,
        DEFAULT_FORMATS: ["配信", "歌みた", "ショート"]
    };

    const controller = createSearchController({ data, ui, constants });
    controller.search();

    assert.equal(data.currentResults.length, 5);
    assert.equal(data.displayLimit, 2);
    assert.equal(ui.el.resultCount.innerText, "ブックマーク: 検証 (5 件)");
});
