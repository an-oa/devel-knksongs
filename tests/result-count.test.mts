import test from "node:test";
import assert from "node:assert/strict";
import { createResultCountController } from "../app/ui/result-summary/count.mts";
import type { SiteLanguage } from "../app/lib/site-language.mts";

/**
 * 件数表示の controller と、表示先の要素・サイトの言語を作る。
 * @param language 最初の言語
 */
function createResultCountHarness(language: SiteLanguage) {
    const resultCount = { innerText: "" };
    const ui = { el: { resultCount }, language: { current: language } };
    return { ui, resultCount, controller: createResultCountController({ ui }) };
}

test("result count: loading states and results are written in the current language", () => {
    const { resultCount, controller } = createResultCountHarness("en");

    controller.render();
    assert.equal(resultCount.innerText, "Connecting...");
    controller.show({ kind: "loadingData" });
    assert.equal(resultCount.innerText, "Loading data...");
    controller.show({ kind: "results", summary: { kind: "search", count: 1 } });
    assert.equal(resultCount.innerText, "1 result");
});

test("result count: switching the language rewrites the current state", () => {
    const { ui, resultCount, controller } = createResultCountHarness("ja");

    controller.show({ kind: "loadingData" });
    ui.language.current = "en";
    controller.render();
    assert.equal(resultCount.innerText, "Loading data...", "a switch while loading keeps showing the loading state");

    controller.show({ kind: "loadError" });
    assert.equal(resultCount.innerText, "Failed to load", "an error after the switch is shown in English");

    ui.language.current = "ja";
    controller.render();
    assert.equal(resultCount.innerText, "読込エラー", "switching back keeps the error instead of returning to connecting");
});

test("result count: a bookmark summary follows the language", () => {
    const { ui, resultCount, controller } = createResultCountHarness("ja");

    controller.show({ kind: "results", summary: { kind: "bookmark", name: "Morning", count: 2 } });
    assert.equal(resultCount.innerText, "ブックマーク: Morning (2 件)");
    ui.language.current = "en";
    controller.render();
    assert.equal(resultCount.innerText, "Bookmark: Morning (2)");
});

test("result count: a missing element is ignored", () => {
    const controller = createResultCountController({ ui: { el: { resultCount: null }, language: { current: "ja" } } });

    assert.doesNotThrow(() => controller.show({ kind: "loadError" }));
});
