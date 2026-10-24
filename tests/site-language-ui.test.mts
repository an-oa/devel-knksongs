import test from "node:test";
import assert from "node:assert/strict";
import { applySiteLanguageFromStorage, setupSiteLanguage } from "../app/ui/core/site-language.mts";
import { SITE_LANGUAGE_STORAGE_KEY, type SiteLanguage } from "../app/lib/site-language.mts";
import { createFakeLocalStorage } from "./fixtures/local-storage.mts";
import { installFakeDom, invokeListener, setGlobalValue } from "./test-helpers.mts";

type SiteLanguageTestUi = {
    el: { languageBtn: HTMLButtonElement };
    language: { current: SiteLanguage };
};

/**
 * サイトの言語のテスト用に、DOM・localStorage・ブラウザの優先言語を差し替えて UI 状態を作る。
 * @param preferredLanguages ブラウザの優先言語
 * @param run 差し替えた環境で実行する検証
 */
function withSiteLanguageUi(preferredLanguages: string[], run: (ui: SiteLanguageTestUi) => void): void {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    globalThis.localStorage = createFakeLocalStorage();
    setGlobalValue("navigator", { languages: preferredLanguages, language: preferredLanguages[0] ?? "" });
    try {
        run({
            el: { languageBtn: document.createElement("button") },
            language: { current: "ja" }
        });
    } finally {
        if (prevNavigator) Object.defineProperty(globalThis, "navigator", prevNavigator);
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
}

/**
 * 言語ボタンに設定した、切り替え先の言語の言語タグと説明を読む。見せる文言は CSS が lang から選ぶ。
 */
function readLanguageButton(button: HTMLButtonElement) {
    return {
        lang: button.getAttribute("lang"),
        label: button.getAttribute("aria-label")
    };
}

test("site language: a Japanese browser starts in Japanese and offers English", () => {
    withSiteLanguageUi(["ja-JP", "en-US"], (ui) => {
        assert.equal(applySiteLanguageFromStorage({ ui }), false);
        assert.equal(ui.language.current, "ja");
        assert.equal(document.documentElement.lang, "ja");
        assert.deepEqual(readLanguageButton(ui.el.languageBtn), {
            lang: "en",
            label: "Show the site in English"
        });
    });
});

test("site language: other browsers start in English and offer Japanese", () => {
    withSiteLanguageUi(["en-US"], (ui) => {
        assert.equal(applySiteLanguageFromStorage({ ui }), true);
        assert.equal(ui.language.current, "en");
        assert.equal(document.documentElement.lang, "en");
        assert.deepEqual(readLanguageButton(ui.el.languageBtn), {
            lang: "ja",
            label: "日本語で表示"
        });

        assert.equal(applySiteLanguageFromStorage({ ui }), false, "an unchanged language does not ask for a redraw");
    });
});

test("site language: a saved choice wins over the browser language", () => {
    withSiteLanguageUi(["en-US"], (ui) => {
        globalThis.localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, "ja");

        assert.equal(applySiteLanguageFromStorage({ ui }), false);
        assert.equal(ui.language.current, "ja");
        assert.equal(readLanguageButton(ui.el.languageBtn).lang, "en");
    });
});

test("site language: setup replaces the static text without redrawing the results", () => {
    withSiteLanguageUi(["en-US"], (ui) => {
        const staticTextLanguages: SiteLanguage[] = [];
        let redrawCount = 0;
        setupSiteLanguage({
            ui,
            applyStaticText: (language) => { staticTextLanguages.push(language); },
            refreshDynamicText: () => { redrawCount += 1; }
        });

        assert.deepEqual(staticTextLanguages, ["en"]);
        assert.equal(redrawCount, 0, "the results are not drawn yet at startup");
    });
});

test("site language: the language button switches, saves, and redraws the text", () => {
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const staticTextLanguages: SiteLanguage[] = [];
        let redrawCount = 0;
        setupSiteLanguage({
            ui,
            applyStaticText: (language) => { staticTextLanguages.push(language); },
            refreshDynamicText: () => { redrawCount += 1; }
        });

        invokeListener(ui.el.languageBtn, "click", {});
        assert.equal(ui.language.current, "en");
        assert.equal(document.documentElement.lang, "en");
        assert.equal(globalThis.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY), "en");
        assert.equal(readLanguageButton(ui.el.languageBtn).lang, "ja");
        assert.deepEqual(staticTextLanguages, ["ja", "en"]);
        assert.equal(redrawCount, 1);

        invokeListener(ui.el.languageBtn, "click", {});
        assert.equal(ui.language.current, "ja");
        assert.equal(globalThis.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY), "ja");
        assert.equal(readLanguageButton(ui.el.languageBtn).lang, "en");
        assert.deepEqual(staticTextLanguages, ["ja", "en", "ja"]);
        assert.equal(redrawCount, 2);
    });
});

test("site language: ?lang is saved like the language button and dropped from the URL", () => {
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const previous = ["location", "history"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
        const replacedUrls: string[] = [];
        setGlobalValue("location", {
            search: "?lang=en&q=1",
            href: "https://example.test/knksongs/?lang=en&q=1#top"
        });
        setGlobalValue("history", {
            state: null,
            replaceState: (_state: unknown, _title: string, url: URL) => { replacedUrls.push(String(url)); }
        });
        document.documentElement.classList.add("i18n-pending");
        try {
            setupSiteLanguage({ ui, applyStaticText: () => {}, refreshDynamicText: () => {} });

            assert.equal(ui.language.current, "en");
            assert.equal(globalThis.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY), "en");
            assert.deepEqual(replacedUrls, ["https://example.test/knksongs/?q=1#top"]);
            assert.equal(document.documentElement.classList.contains("i18n-pending"), false, "the page is shown after the text is replaced");
        } finally {
            for (const [name, descriptor] of previous) {
                if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                else Reflect.deleteProperty(globalThis, name);
            }
        }
    });
});
