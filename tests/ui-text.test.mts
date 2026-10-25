import test from "node:test";
import assert from "node:assert/strict";
import { getUiText } from "../app/lib/ui-text.mts";

test("ui text: filter format names follow the English sheet, card tags use short names, and unknown values stay", () => {
    const ja = getUiText("ja");
    const en = getUiText("en");

    assert.equal(ja.formatFilter("歌みた"), "オリ曲/歌みた");
    assert.equal(ja.formatFilter("配信"), "配信");
    assert.equal(ja.formatTag("切り抜き"), "切り抜き");

    assert.deepEqual(
        ["配信", "歌みた", "オリ曲", "ショート", "切り抜き", "収録"].map(en.formatTag),
        ["Stream", "Cover", "Original", "Shorts", "Clip", "Recording"],
        "card tags are short because the card footer is narrow"
    );
    assert.deepEqual(
        ["配信", "歌みた", "ショート", "切り抜き", "収録"].map(en.formatFilter),
        ["Singing Stream", "Originals & Covers", "Shorts", "Clip", "Pre-recorded"],
        "the filters keep the names of the English sheet, and the cover item also covers original songs"
    );
    assert.equal(en.formatTag("新しい形態"), "新しい形態", "unknown formats are shown as they are");
});

test("ui text: result counts use the language's grammar", () => {
    const ja = getUiText("ja").results;
    const en = getUiText("en").results;

    assert.equal(ja.count({ kind: "search", count: 102 }), "102 件がヒット");
    assert.equal(ja.count({ kind: "bookmark", name: "朝", count: 3 }), "ブックマーク: 朝 (3 件)");
    assert.equal(ja.count({ kind: "recommended" }), "おすすめを表示中");
    assert.equal(en.count({ kind: "search", count: 1 }), "1 result");
    assert.equal(en.count({ kind: "search", count: 0 }), "0 results");
    assert.equal(en.count({ kind: "bookmark", name: "Morning", count: 3 }), "Bookmark: Morning (3)");
    assert.equal(en.count({ kind: "recommended" }), "Showing recommendations");
});

test("ui text: English card dates come from dateKey as Oct 8, 2026", () => {
    const ja = getUiText("ja").card;
    const en = getUiText("en").card;

    assert.equal(ja.date({ date: "2026/10/08", dateKey: 20261008 }), "2026/10/08");
    assert.equal(en.date({ date: "2026/10/08", dateKey: 20261008 }), "Oct 8, 2026");
    assert.equal(en.date({ date: "2024/01/31", dateKey: 20240131 }), "Jan 31, 2024");
    assert.equal(en.date({ date: "日付不明", dateKey: null }), "日付不明", "songs without a date key keep the sheet text");
});

test("ui text: English date chips read partial dates as words", () => {
    const en = getUiText("en").chips;

    assert.equal(en.dateFrom("2025"), "From 2025");
    assert.equal(en.dateFrom("2025-03"), "From Mar 2025");
    assert.equal(en.dateTo("2025-12-05"), "Until Dec 5, 2025");
    assert.equal(en.dateTo("2025-13"), "Until 2025-13", "values outside the calendar are left as they are");
});
