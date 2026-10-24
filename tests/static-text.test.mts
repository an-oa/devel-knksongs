import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyStaticUiText } from "../app/ui/core/static-text.mts";
import { getUiText } from "../app/lib/ui-text.mts";
import { installFakeDom } from "./test-helpers.mts";

const INDEX_HTML = new URL("../public/index.html", import.meta.url);

/**
 * index.html から、固定の文言のキーと、その要素に書いた日本語の文言・属性値を読む。
 * 属性の値は data 属性の直前に書く約束なので、同じタグの中から同じ名前の属性を探す。
 */
async function readStaticTextBindings() {
    const html = (await readFile(INDEX_HTML, "utf8")).replace(/<!--[\s\S]*?-->/g, "");
    const bindings: { key: string; target: string; value: string; language: "ja" | "en" }[] = [];
    for (const tag of html.matchAll(/<[a-z][^>]*\sdata-i18n[^>]*>/g)) {
        const source = tag[0];
        // 幅を固定するために重ねた文言は、data-i18n-lang の言語の辞書と比べる
        const language = /\sdata-i18n-lang="en"/.test(source) ? "en" : "ja";
        const textKey = /\sdata-i18n="([^"]+)"/.exec(source);
        if (textKey) {
            const rest = html.slice(tag.index + source.length);
            bindings.push({ key: textKey[1], target: "text", value: rest.slice(0, rest.indexOf("<")), language });
        }
        for (const [, attribute, key] of source.matchAll(/\sdata-i18n-((?!lang\b)[a-z-]+)="([^"]+)"/g)) {
            const value = new RegExp(`\\s${attribute}="([^"]*)"`).exec(source);
            bindings.push({ key, target: attribute, value: value ? value[1] : "", language });
        }
    }
    return bindings;
}

test("static text: every key in index.html exists in both dictionaries", async () => {
    const bindings = await readStaticTextBindings();
    assert.ok(bindings.length > 30, "index.html should have static text keys");
    for (const language of ["ja", "en"] as const) {
        const texts = getUiText(language).static;
        for (const { key } of bindings) {
            assert.ok(Object.hasOwn(texts, key), `${language} has no static text for ${key}`);
        }
    }
});

test("static text: the dictionaries match the text written in index.html", async () => {
    for (const { key, target, value, language } of await readStaticTextBindings()) {
        const texts: Record<string, string> = getUiText(language).static;
        assert.equal(texts[key], value, `${key} (${target}, ${language}) differs from index.html`);
    }
});

test("static text: elements and attributes are replaced with the chosen language", () => {
    const restoreDom = installFakeDom();
    try {
        const root = document.createElement("div");
        const title = document.createElement("h2");
        title.setAttribute("data-i18n", "sidebarTitle");
        title.textContent = "絞り込み・設定";
        const close = document.createElement("button");
        close.setAttribute("data-i18n-aria-label", "close");
        close.setAttribute("aria-label", "閉じる");
        const search = document.createElement("input");
        search.setAttribute("data-i18n-placeholder", "searchPlaceholder");
        const unknown = document.createElement("span");
        unknown.setAttribute("data-i18n", "noSuchKey");
        unknown.textContent = "そのまま";
        const stackedJapanese = document.createElement("span");
        stackedJapanese.setAttribute("data-i18n", "filters");
        stackedJapanese.setAttribute("data-i18n-lang", "ja");
        root.append(title, close, search, unknown, stackedJapanese);

        applyStaticUiText(root, "en");

        assert.equal(stackedJapanese.textContent, "絞り込み", "stacked text keeps its own language");
        assert.equal(title.textContent, "Filters & Settings");
        assert.equal(close.getAttribute("aria-label"), "Close");
        assert.equal(search.getAttribute("placeholder"), "Song or artist...");
        assert.equal(unknown.textContent, "そのまま", "unknown keys keep the HTML text");

        applyStaticUiText(root, "ja");
        assert.equal(title.textContent, "絞り込み・設定");
        assert.equal(close.getAttribute("aria-label"), "閉じる");
    } finally {
        restoreDom();
    }
});
