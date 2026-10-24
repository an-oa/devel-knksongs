import test from "node:test";
import assert from "node:assert/strict";
import { applySongNameLanguageFromStorage, setupSongNames } from "../app/ui/core/song-names.mts";
import { SONG_NAME_LANGUAGE_STORAGE_KEY, type SongNameLanguage } from "../app/lib/song-display-name.mts";
import { createFakeLocalStorage } from "./fixtures/local-storage.mts";
import { installFakeDom, invokeListener, setGlobalValue } from "./test-helpers.mts";

type SongNamesTestUi = {
    el: { songNameLanguageBtn: HTMLButtonElement };
    songName: { language: SongNameLanguage };
};

/**
 * 曲名の表記のテスト用に、DOM・localStorage・ブラウザの優先言語を差し替えて UI 状態を作る。
 * @param preferredLanguages ブラウザの優先言語
 * @param run 差し替えた環境で実行する検証
 */
function withSongNamesUi(preferredLanguages: string[], run: (ui: SongNamesTestUi) => void): void {
    const restoreDom = installFakeDom();
    const prevLocalStorage = globalThis.localStorage;
    const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    globalThis.localStorage = createFakeLocalStorage();
    setGlobalValue("navigator", { languages: preferredLanguages, language: preferredLanguages[0] ?? "" });
    try {
        const button = document.createElement("button");
        run({
            el: { songNameLanguageBtn: button },
            songName: { language: "ja" }
        });
    } finally {
        if (prevNavigator) Object.defineProperty(globalThis, "navigator", prevNavigator);
        globalThis.localStorage = prevLocalStorage;
        restoreDom();
    }
}

/**
 * 言語ボタンに設定した、切り替え先の表記の言語タグと説明を読む。見せる文言は CSS が lang から選ぶ。
 */
function readLanguageButton(button: HTMLButtonElement) {
    return {
        lang: button.getAttribute("lang"),
        label: button.getAttribute("aria-label")
    };
}

test("song names: a Japanese browser starts with Japanese names and offers English", () => {
    withSongNamesUi(["ja-JP", "en-US"], (ui) => {
        assert.equal(applySongNameLanguageFromStorage({ ui }), false);
        assert.equal(ui.songName.language, "ja");
        assert.deepEqual(readLanguageButton(ui.el.songNameLanguageBtn), {
            lang: "en",
            label: "Show song and artist names in English"
        });
    });
});

test("song names: other browsers start with English names and offer Japanese", () => {
    withSongNamesUi(["en-US"], (ui) => {
        assert.equal(applySongNameLanguageFromStorage({ ui }), true);
        assert.equal(ui.songName.language, "en");
        assert.deepEqual(readLanguageButton(ui.el.songNameLanguageBtn), {
            lang: "ja",
            label: "曲名とアーティスト名を日本語で表示"
        });

        assert.equal(applySongNameLanguageFromStorage({ ui }), false, "an unchanged language does not ask for a redraw");
    });
});

test("song names: a saved choice wins over the browser language", () => {
    withSongNamesUi(["en-US"], (ui) => {
        globalThis.localStorage.setItem(SONG_NAME_LANGUAGE_STORAGE_KEY, "ja");

        assert.equal(applySongNameLanguageFromStorage({ ui }), false);
        assert.equal(ui.songName.language, "ja");
        assert.equal(readLanguageButton(ui.el.songNameLanguageBtn).lang, "en");
    });
});

test("song names: the language button switches, saves, and redraws the results", () => {
    withSongNamesUi(["ja-JP"], (ui) => {
        let redrawCount = 0;
        setupSongNames({ ui, updateDisplay: () => { redrawCount += 1; } });
        assert.equal(redrawCount, 0, "setup restores the language without redrawing");

        invokeListener(ui.el.songNameLanguageBtn, "click", {});
        assert.equal(ui.songName.language, "en");
        assert.equal(globalThis.localStorage.getItem(SONG_NAME_LANGUAGE_STORAGE_KEY), "en");
        assert.equal(readLanguageButton(ui.el.songNameLanguageBtn).lang, "ja");
        assert.equal(redrawCount, 1);

        invokeListener(ui.el.songNameLanguageBtn, "click", {});
        assert.equal(ui.songName.language, "ja");
        assert.equal(globalThis.localStorage.getItem(SONG_NAME_LANGUAGE_STORAGE_KEY), "ja");
        assert.equal(readLanguageButton(ui.el.songNameLanguageBtn).lang, "en");
        assert.equal(redrawCount, 2);
    });
});
