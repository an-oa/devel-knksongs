import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createSiteLanguageController } from "../app/ui/core/site-language.mts";
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
 * @param storage 差し替える localStorage。省略時は空のメモリ実装
 */
function withSiteLanguageUi(
    preferredLanguages: string[],
    run: (ui: SiteLanguageTestUi) => void,
    storage: Storage = createFakeLocalStorage()
): void {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    globalThis.localStorage = storage;
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
 * 読み書きのどちらも失敗する localStorage を作る。保存できない環境の再現に使う。
 */
function createUnavailableLocalStorage(): Storage {
    return {
        ...createFakeLocalStorage(),
        getItem() { throw new Error("storage is unavailable"); },
        setItem() { throw new Error("storage is unavailable"); }
    };
}

/**
 * 保存済みの言語は読めるが、新しい値は書き込めない localStorage を作る。容量不足などで保存だけが失敗する環境の再現に使う。
 * @param storedLanguage 保存済みの言語
 */
function createReadOnlyLocalStorage(storedLanguage: SiteLanguage): Storage {
    const storage = createFakeLocalStorage();
    storage.setItem(SITE_LANGUAGE_STORAGE_KEY, storedLanguage);
    return {
        ...storage,
        getItem: (key: string) => storage.getItem(key),
        setItem() { throw new Error("storage is full"); }
    };
}

/**
 * 固定の文言の置き換えと描き直しの呼び出しを記録しながら、サイトの言語の controller を作る。
 * @param ui サイトの言語の UI 状態
 */
function createRecordedController(ui: SiteLanguageTestUi) {
    const staticTextLanguages: SiteLanguage[] = [];
    let redrawCount = 0;
    const controller = createSiteLanguageController({
        ui,
        applyStaticText: (language) => { staticTextLanguages.push(language); },
        refreshDynamicText: () => { redrawCount += 1; }
    });
    return { controller, staticTextLanguages, getRedrawCount: () => redrawCount };
}

/**
 * ?lang を付けた URL で開いた状態にし、アドレス欄の書き換えを記録する。戻す関数を返す。
 * @param search URL の query
 * @param replacedUrls アドレス欄に書いた URL を入れる配列
 */
function openWithQuery(search: string, replacedUrls: string[]): () => void {
    const previous = ["location", "history"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    setGlobalValue("location", { search, href: `https://example.test/knksongs/${search}#top` });
    setGlobalValue("history", {
        state: null,
        replaceState: (_state: unknown, _title: string, url: URL) => { replacedUrls.push(String(url)); }
    });
    return () => {
        for (const [name, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    };
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
        const { controller } = createRecordedController(ui);
        controller.setup();

        assert.equal(ui.language.current, "ja");
        assert.equal(document.documentElement.lang, "ja");
        assert.deepEqual(readLanguageButton(ui.el.languageBtn), {
            lang: "en",
            label: "Show the site in English"
        });
        assert.equal(globalThis.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY), null, "the browser language is not saved");
    });
});

test("site language: other browsers start in English and offer Japanese", () => {
    withSiteLanguageUi(["en-US"], (ui) => {
        const { controller } = createRecordedController(ui);
        controller.setup();

        assert.equal(ui.language.current, "en");
        assert.equal(document.documentElement.lang, "en");
        assert.deepEqual(readLanguageButton(ui.el.languageBtn), {
            lang: "ja",
            label: "日本語で表示"
        });
    });
});

test("site language: a saved choice wins over the browser language", () => {
    withSiteLanguageUi(["en-US"], (ui) => {
        globalThis.localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, "ja");
        const { controller } = createRecordedController(ui);
        controller.setup();

        assert.equal(ui.language.current, "ja");
        assert.equal(readLanguageButton(ui.el.languageBtn).lang, "en");
    });
});

test("site language: setup replaces the static text without redrawing the results", () => {
    withSiteLanguageUi(["en-US"], (ui) => {
        const { controller, staticTextLanguages, getRedrawCount } = createRecordedController(ui);
        document.documentElement.classList.add("i18n-pending");
        controller.setup();

        assert.deepEqual(staticTextLanguages, ["en"]);
        assert.equal(getRedrawCount(), 0, "the results are not drawn yet at startup");
        assert.equal(document.documentElement.classList.contains("i18n-pending"), false, "the page is shown after the text is replaced");
    });
});

test("site language: the language button switches, saves, and redraws the text", () => {
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const { controller, staticTextLanguages, getRedrawCount } = createRecordedController(ui);
        controller.setup();

        invokeListener(ui.el.languageBtn, "click", {});
        assert.equal(ui.language.current, "en");
        assert.equal(document.documentElement.lang, "en");
        assert.equal(globalThis.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY), "en");
        assert.equal(readLanguageButton(ui.el.languageBtn).lang, "ja");
        assert.deepEqual(staticTextLanguages, ["ja", "en"]);
        assert.equal(getRedrawCount(), 1);

        invokeListener(ui.el.languageBtn, "click", {});
        assert.equal(ui.language.current, "ja");
        assert.equal(globalThis.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY), "ja");
        assert.equal(readLanguageButton(ui.el.languageBtn).lang, "en");
        assert.deepEqual(staticTextLanguages, ["ja", "en", "ja"]);
        assert.equal(getRedrawCount(), 2);
    });
});

test("site language: syncing picks up a language saved in another tab", () => {
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const { controller } = createRecordedController(ui);
        controller.setup();

        assert.equal(controller.syncFromStorage(), false, "an unchanged language does not ask for a redraw");

        globalThis.localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, "en");
        assert.equal(controller.syncFromStorage(), true);
        assert.equal(ui.language.current, "en");
        assert.equal(document.documentElement.lang, "en");
        assert.equal(readLanguageButton(ui.el.languageBtn).lang, "ja");
    });
});

test("site language: a saved button choice still follows a language changed in another tab", () => {
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const { controller } = createRecordedController(ui);
        controller.setup();
        invokeListener(ui.el.languageBtn, "click", {});
        assert.equal(ui.language.current, "en");

        globalThis.localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, "ja");
        assert.equal(controller.syncFromStorage(), true);
        assert.equal(ui.language.current, "ja");
    });
});

test("site language: ?lang is saved like the language button and dropped from the URL", () => {
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const replacedUrls: string[] = [];
        const restoreUrl = openWithQuery("?lang=en&q=1", replacedUrls);
        try {
            const { controller, staticTextLanguages } = createRecordedController(ui);
            controller.setup();

            assert.equal(ui.language.current, "en");
            assert.deepEqual(staticTextLanguages, ["en"]);
            assert.equal(globalThis.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY), "en");
            assert.deepEqual(replacedUrls, ["https://example.test/knksongs/?q=1#top"]);
        } finally {
            restoreUrl();
        }
    });
});

test("site language: ?lang is used even when it cannot be saved", (t: TestContext) => {
    t.mock.method(console, "warn", () => {});
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const restoreUrl = openWithQuery("?lang=en", []);
        try {
            const { controller, staticTextLanguages } = createRecordedController(ui);
            controller.setup();

            assert.equal(ui.language.current, "en");
            assert.deepEqual(staticTextLanguages, ["en"]);
            assert.equal(controller.syncFromStorage(), false, "syncing does not fall back to the Japanese browser language");
            assert.equal(ui.language.current, "en");
        } finally {
            restoreUrl();
        }
    }, createUnavailableLocalStorage());
});

test("site language: a button choice survives syncing when it cannot be saved", (t: TestContext) => {
    t.mock.method(console, "warn", () => {});
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const { controller } = createRecordedController(ui);
        controller.setup();
        assert.equal(ui.language.current, "ja");

        invokeListener(ui.el.languageBtn, "click", {});
        assert.equal(ui.language.current, "en");
        assert.equal(controller.syncFromStorage(), false);
        assert.equal(ui.language.current, "en");
    }, createUnavailableLocalStorage());
});

test("site language: a button choice that cannot be saved is not undone by the older saved value", (t: TestContext) => {
    t.mock.method(console, "warn", () => {});
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const { controller } = createRecordedController(ui);
        controller.setup();
        assert.equal(ui.language.current, "ja");

        invokeListener(ui.el.languageBtn, "click", {});
        assert.equal(ui.language.current, "en");
        assert.equal(globalThis.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY), "ja", "the old value is still saved");
        assert.equal(controller.syncFromStorage(), false);
        assert.equal(ui.language.current, "en");
    }, createReadOnlyLocalStorage("ja"));
});

test("site language: ?lang that cannot be saved wins over the older saved value", (t: TestContext) => {
    t.mock.method(console, "warn", () => {});
    withSiteLanguageUi(["ja-JP"], (ui) => {
        const restoreUrl = openWithQuery("?lang=en", []);
        try {
            const { controller } = createRecordedController(ui);
            controller.setup();

            assert.equal(ui.language.current, "en");
            assert.equal(controller.syncFromStorage(), false);
            assert.equal(ui.language.current, "en");
        } finally {
            restoreUrl();
        }
    }, createReadOnlyLocalStorage("ja"));
});
