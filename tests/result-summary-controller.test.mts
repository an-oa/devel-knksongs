import test from "node:test";
import assert from "node:assert/strict";
import { createResultSummaryController } from "../app/ui/result-summary/controller.mts";
import type { SearchBooleanFilterKey } from "../app/lib/search-boolean-filters.mts";
import type { SiteLanguage } from "../app/lib/site-language.mts";
import { installFakeDom } from "./test-helpers.mts";

type SummaryState = {
    query: string;
    dateFrom: string;
    dateTo: string;
    selectedFormats: string[];
    flags: Set<SearchBooleanFilterKey>;
    bookmarkActive: boolean;
};

const ALL_FORMATS = ["配信", "歌みた", "ショート"];

/**
 * 概要行 controller と、解除操作で状態を更新して即時に再描画する検索側の代役を作る。
 * @param initial 初期の検索条件
 * @param language サイトの言語
 */
function createHarness(initial: Partial<SummaryState> = {}, language: SiteLanguage = "ja") {
    const state: SummaryState = {
        query: "",
        dateFrom: "",
        dateTo: "",
        selectedFormats: [...ALL_FORMATS],
        flags: new Set(),
        bookmarkActive: false,
        ...initial
    };
    const el = {
        searchBox: document.createElement("input") as HTMLInputElement,
        resultConditions: document.createElement("ul"),
        resultClearAll: document.createElement("button") as HTMLButtonElement
    };
    const calls: string[] = [];
    // 本番では解除操作が即時検索を行い、その結果反映で render が呼ばれる。
    const commit = (name: string, update: () => void) => {
        calls.push(name);
        update();
        controller.render();
    };
    const ui = { el, language: { current: language } };
    const controller = createResultSummaryController({
        ui,
        conditions: {
            getQuery: () => state.query,
            getDateValue: (kind) => (kind === "from" ? state.dateFrom : state.dateTo),
            getSelectedFormats: () => ALL_FORMATS.filter((format) => state.selectedFormats.includes(format)),
            areAllFormatsSelected: () => ALL_FORMATS.every((format) => state.selectedFormats.includes(format)),
            isBooleanFilterEnabled: (key) => state.flags.has(key),
            isBookmarkActive: () => state.bookmarkActive
        },
        actions: {
            clearSearchQuery: () => commit("query", () => { state.query = ""; }),
            clearDateFilter: (kind) => commit(`date-${kind}`, () => {
                if (kind === "from") state.dateFrom = "";
                else state.dateTo = "";
            }),
            resetFormatFilters: () => commit("formats", () => { state.selectedFormats = [...ALL_FORMATS]; }),
            clearBooleanFilter: (key) => commit(key, () => { state.flags.delete(key); }),
            clearSearch: () => commit("all", () => {
                Object.assign(state, { query: "", dateFrom: "", dateTo: "", selectedFormats: [...ALL_FORMATS], bookmarkActive: false });
                state.flags.clear();
            })
        }
    });
    /** 描画されたチップのボタンを返す。 */
    const getChips = () => Array.from(el.resultConditions.querySelectorAll(".result-condition-chip")) as HTMLElement[];
    /** チップの表示名だけを返す。 */
    const getChipLabels = () => Array.from(el.resultConditions.querySelectorAll(".result-condition-chip-label"))
        .map((label) => label.textContent);
    return { state, el, ui, calls, controller, getChips, getChipLabels };
}

test("result summary: shows active conditions as chips in search order", () => {
    const cleanup = installFakeDom();
    try {
        const { el, controller, getChips, getChipLabels } = createHarness({
            query: " ミク ",
            dateFrom: "2025-03",
            dateTo: "2026",
            selectedFormats: ["配信", "歌みた"],
            flags: new Set(["harmonyOnly", "relayOnly"])
        });
        controller.render();

        assert.deepEqual(getChipLabels(), [
            "「ミク」",
            "2025/03〜",
            "〜2026",
            "種類: 配信・オリ曲/歌みた",
            "歌枠リレー",
            "ハモリあり"
        ]);
        assert.equal(getChips()[0].title, "「ミク」");
        assert.equal(getChips()[0].getAttribute("aria-label"), "「ミク」の条件を解除");
        assert.equal(el.resultClearAll.hidden, false);
    } finally {
        cleanup();
    }
});

test("result summary: English chips use English words and dates, and follow a language switch", () => {
    const cleanup = installFakeDom();
    try {
        const { ui, controller, getChips, getChipLabels } = createHarness({
            query: " ミク ",
            dateFrom: "2025-03",
            dateTo: "2026-10-08",
            selectedFormats: ["配信", "歌みた"],
            flags: new Set(["collabHostOnly", "harmonyOnly"])
        }, "en");
        controller.render();

        assert.deepEqual(getChipLabels(), [
            "“ミク”",
            "From Mar 2025",
            "Until Oct 8, 2026",
            "Types: Singing Stream, Originals & Covers",
            "Collab (host)",
            "With harmony"
        ]);
        assert.equal(getChips()[0].getAttribute("aria-label"), "Remove filter: “ミク”");

        ui.language.current = "ja";
        controller.render();

        assert.deepEqual(getChipLabels(), [
            "「ミク」",
            "2025/03〜",
            "〜2026/10/08",
            "種類: 配信・オリ曲/歌みた",
            "コラボ(ホスト)",
            "ハモリあり"
        ]);
    } finally {
        cleanup();
    }
});

test("result summary: hides clear-all without conditions unless a bookmark is active", () => {
    const cleanup = installFakeDom();
    try {
        const empty = createHarness();
        empty.controller.render();
        assert.deepEqual(empty.getChipLabels(), []);
        assert.equal(empty.el.resultClearAll.hidden, true);

        const bookmark = createHarness({ bookmarkActive: true });
        bookmark.controller.render();
        assert.deepEqual(bookmark.getChipLabels(), []);
        assert.equal(bookmark.el.resultClearAll.hidden, false);
    } finally {
        cleanup();
    }
});

test("result summary: re-rendering keeps existing chip elements and the focused chip", () => {
    const cleanup = installFakeDom();
    try {
        const { state, controller, getChips, getChipLabels } = createHarness({ flags: new Set(["harmonyOnly"]) });
        controller.render();
        const harmonyChip = getChips()[0];
        harmonyChip.focus();

        state.query = "ミク";
        state.flags.add("relayOnly");
        controller.render();

        assert.deepEqual(getChipLabels(), ["「ミク」", "歌枠リレー", "ハモリあり"]);
        assert.equal(getChips()[2], harmonyChip);
        assert.equal(document.activeElement, harmonyChip);

        state.query = "ミクさん";
        controller.render();
        assert.deepEqual(getChipLabels(), ["「ミクさん」", "歌枠リレー", "ハモリあり"]);
        assert.equal(getChips()[2], harmonyChip);
    } finally {
        cleanup();
    }
});

test("result summary: removing a chip calls its action once and moves focus in the same operation", () => {
    const cleanup = installFakeDom();
    try {
        const { el, calls, controller, getChips, getChipLabels } = createHarness({
            query: "ミク",
            selectedFormats: ["配信"],
            flags: new Set(["collabHostOnly"])
        });
        controller.setup();
        controller.render();

        getChips()[1].click();
        assert.deepEqual(calls, ["formats"]);
        assert.deepEqual(getChipLabels(), ["「ミク」", "コラボ(ホスト)"]);
        assert.equal(document.activeElement, getChips()[1]);

        getChips()[1].click();
        getChips()[0].click();
        assert.deepEqual(calls, ["formats", "collabHostOnly", "query"]);
        assert.deepEqual(getChipLabels(), []);
        assert.equal(el.resultClearAll.hidden, true);
        assert.equal(document.activeElement, el.searchBox);
    } finally {
        cleanup();
    }
});

test("result summary: clear-all delegates once and focuses the search box", () => {
    const cleanup = installFakeDom();
    try {
        const { el, calls, controller, getChipLabels } = createHarness({ dateTo: "2026-01-02", bookmarkActive: true });
        controller.setup();
        controller.render();
        assert.deepEqual(getChipLabels(), ["〜2026/01/02"]);

        el.resultClearAll.click();
        assert.deepEqual(calls, ["all"]);
        assert.deepEqual(getChipLabels(), []);
        assert.equal(el.resultClearAll.hidden, true);
        assert.equal(document.activeElement, el.searchBox);
    } finally {
        cleanup();
    }
});
