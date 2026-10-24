import type { AppUiState } from "../../state.types";
import { getStoredSettingText, setStoredSettingText } from "../../lib/storage/settings-storage.mjs";
import {
    resolveSiteLanguage,
    SITE_LANGUAGE_STORAGE_KEY,
    type SiteLanguage
} from "../../lib/site-language.mjs";

type SiteLanguageUiState = Pick<AppUiState, "language"> & {
    el: Pick<AppUiState["el"], "languageBtn">;
};

type SiteLanguageSetupInput = {
    ui: SiteLanguageUiState;
    /** index.html に書いた固定の文言を、指定した言語へ置き換える。 */
    applyStaticText: (language: SiteLanguage) => void;
    /** 結果一覧や条件の表示など、描画済みの文言を今の言語で描き直す。 */
    refreshDynamicText: () => void;
};

/**
 * 言語ボタンの、切り替え先の言語ごとの言語タグと説明。ボタンに見せる文言は index.html に両方置いてある。
 * 日本語を読めない人にも見つけられるよう、切り替え先の言語そのもので書く。
 */
const LANGUAGE_BUTTON_LABELS = {
    en: { lang: "en", description: "Show the site in English" },
    ja: { lang: "ja", description: "日本語で表示" }
} as const satisfies Record<SiteLanguage, { lang: string; description: string }>;

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
 * ページの lang と言語ボタンを、今の言語に合わせる。
 * 言語ボタンには両方の文言を重ねてあり、CSS がボタンの lang と同じ言語の文言だけを見せる。
 * @param ui サイトの言語と言語ボタン
 */
function applyLanguageToPage(ui: SiteLanguageUiState): void {
    const language = ui.language.current;
    if (typeof document !== "undefined") document.documentElement.lang = language;
    const button = ui.el.languageBtn;
    if (!button) return;
    const target = LANGUAGE_BUTTON_LABELS[language === "en" ? "ja" : "en"];
    button.setAttribute("lang", target.lang);
    button.setAttribute("aria-label", target.description);
    button.setAttribute("title", target.description);
}

/**
 * 保存値またはブラウザの言語からサイトの言語を決め、ページの lang と言語ボタンへ反映する。
 * @param ui サイトの言語と言語ボタン
 * @returns 言語が変わった場合は true
 */
export function applySiteLanguageFromStorage({ ui }: { ui: SiteLanguageUiState }): boolean {
    const language = resolveSiteLanguage(
        getStoredSettingText(SITE_LANGUAGE_STORAGE_KEY),
        getPreferredLanguages()
    );
    const changed = ui.language.current !== language;
    ui.language.current = language;
    applyLanguageToPage(ui);
    return changed;
}

/**
 * サイトの言語を復元して固定の文言を合わせ、言語ボタンで切り替えて保存する。
 * 起動時は結果一覧をまだ描いていないので、描画済みの文言の描き直しは切り替えたときだけ行う。
 * @param input サイトの言語の状態と、文言を置き換える処理
 */
export function setupSiteLanguage({ ui, applyStaticText, refreshDynamicText }: SiteLanguageSetupInput): void {
    applySiteLanguageFromStorage({ ui });
    applyStaticText(ui.language.current);
    const button = ui.el.languageBtn;
    if (!button) return;
    button.addEventListener("click", () => {
        const language: SiteLanguage = ui.language.current === "en" ? "ja" : "en";
        ui.language.current = language;
        setStoredSettingText(SITE_LANGUAGE_STORAGE_KEY, language);
        applyLanguageToPage(ui);
        applyStaticText(language);
        refreshDynamicText();
    });
}
