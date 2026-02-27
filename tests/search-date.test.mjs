import test from "node:test";
import assert from "node:assert/strict";
import {
    normalizeForSearch,
    parseDateKey,
    isWithinDateRange,
    filterSongsByCriteria
} from "../search.mjs";

function makeRow(input) {
    const title = input.title ?? "";
    const artist = input.artist ?? "";
    const titleYomi = input.titleYomi ?? "";
    const artistYomi = input.artistYomi ?? "";
    return {
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
