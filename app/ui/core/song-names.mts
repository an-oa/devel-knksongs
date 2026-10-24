import type { AppUiState } from "../../state.types";
import { getStoredSettingText, setStoredSettingText } from "../../lib/storage/settings-storage.mjs";
import {
    resolveSongNameLanguage,
    SONG_NAME_LANGUAGE_STORAGE_KEY,
    type SongNameLanguage
} from "../../lib/song-display-name.mjs";

type SongNamesUiState = Pick<AppUiState, "songName"> & {
    el: Pick<AppUiState["el"], "songNameLanguageBtn">;
};

/**
 * 言語ボタンの、切り替え先の表記ごとの言語タグと説明。ボタンに見せる文言は index.html に両方置いてある。
 * 日本語を読めない人にも見つけられるよう、切り替え先の言語そのもので書く。
 */
const LANGUAGE_BUTTON_LABELS = {
    en: { lang: "en", description: "Show song and artist names in English" },
    ja: { lang: "ja", description: "曲名とアーティスト名を日本語で表示" }
} as const satisfies Record<SongNameLanguage, { lang: string; description: string }>;

/**
 * ブラウザの優先言語を、優先度の高い順で返す。取得できない環境では空配列を返す。
 * @returns ブラウザの優先言語
 */
function getPreferredLanguages(): readonly string[] {
    const browserNavigator = globalThis.navigator;
    if (!browserNavigator) return [];
    if (Array.isArray(browserNavigator.languages) && browserNavigator.languages.length > 0) {
        return browserNavigator.languages;
    }
    return typeof browserNavigator.language === "string" ? [browserNavigator.language] : [];
}

/**
 * 言語ボタンを、今の表記から切り替える先の表記で表示する。
 * ボタンには両方の文言を重ねてあり、CSS がボタンの lang と同じ言語の文言だけを見せる。
 * @param button 言語ボタン
 * @param language 今表示している表記
 */
function updateLanguageButton(button: HTMLButtonElement, language: SongNameLanguage): void {
    const target = LANGUAGE_BUTTON_LABELS[language === "en" ? "ja" : "en"];
    button.setAttribute("lang", target.lang);
    button.setAttribute("aria-label", target.description);
    button.setAttribute("title", target.description);
}

/**
 * 保存値またはブラウザの言語から曲名・アーティスト名の表記を決め、言語ボタンへ反映する。
 * @param ui 表記の状態と言語ボタン
 * @returns 表記が変わった場合は true
 */
export function applySongNameLanguageFromStorage({ ui }: { ui: SongNamesUiState }): boolean {
    const language = resolveSongNameLanguage(
        getStoredSettingText(SONG_NAME_LANGUAGE_STORAGE_KEY),
        getPreferredLanguages()
    );
    const button = ui.el.songNameLanguageBtn;
    if (button) updateLanguageButton(button, language);
    if (ui.songName.language === language) return false;
    ui.songName.language = language;
    return true;
}

/**
 * 曲名・アーティスト名の表記を復元し、言語ボタンで切り替えて保存し、結果一覧を描き直す。
 * @param ui 表記の状態と言語ボタン
 * @param updateDisplay 表示中の結果カードを描き直す関数
 */
export function setupSongNames({ ui, updateDisplay }: { ui: SongNamesUiState; updateDisplay: () => void }): void {
    applySongNameLanguageFromStorage({ ui });
    const button = ui.el.songNameLanguageBtn;
    if (!button) return;
    button.addEventListener("click", () => {
        const language: SongNameLanguage = ui.songName.language === "en" ? "ja" : "en";
        ui.songName.language = language;
        setStoredSettingText(SONG_NAME_LANGUAGE_STORAGE_KEY, language);
        updateLanguageButton(button, language);
        updateDisplay();
    });
}
