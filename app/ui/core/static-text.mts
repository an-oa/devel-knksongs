import { getUiText, type StaticTextKey } from "../../lib/ui-text.mjs";
import type { SiteLanguage } from "../../lib/site-language.mjs";

/** 固定の文言を入れる属性と、その文言のキーを書く data 属性の組。 */
const STATIC_TEXT_ATTRIBUTES = [
    ["data-i18n-aria-label", "aria-label"],
    ["data-i18n-placeholder", "placeholder"],
    ["data-i18n-title", "title"]
] as const;

/**
 * 値が固定の文言のキーか判定する。
 * @param texts 固定の文言
 * @param key data 属性に書かれた値
 * @returns 固定の文言のキーなら true
 */
function isStaticTextKey(texts: Record<StaticTextKey, string>, key: string | null): key is StaticTextKey {
    return key !== null && Object.hasOwn(texts, key);
}

/**
 * 要素に入れる文言の言語を返す。data-i18n-lang があれば、ページの言語によらずその言語にする。
 * 幅を変えたくない文言は、両方の言語の要素を重ねて置き、それぞれに data-i18n-lang を付ける。
 * @param element 文言を入れる要素
 * @param language サイトの言語
 * @returns 文言の言語
 */
function getElementTextLanguage(element: Element, language: SiteLanguage): SiteLanguage {
    const fixed = element.getAttribute("data-i18n-lang");
    return fixed === "ja" || fixed === "en" ? fixed : language;
}

/**
 * index.html に書いた固定の文言を、指定した言語の文言へ置き換える。
 * data-i18n は要素の文字を、data-i18n-aria-label などは対応する属性を置き換える。
 * 辞書にないキーは、HTML の文言を残すため置き換えない。
 * @param root 置き換える範囲
 * @param language サイトの言語
 */
export function applyStaticUiText(root: ParentNode, language: SiteLanguage): void {
    const texts = getUiText(language).static;
    root.querySelectorAll("[data-i18n]").forEach((element) => {
        const key = element.getAttribute("data-i18n");
        const elementTexts = getUiText(getElementTextLanguage(element, language)).static;
        if (isStaticTextKey(elementTexts, key)) element.textContent = elementTexts[key];
    });
    for (const [dataAttribute, attribute] of STATIC_TEXT_ATTRIBUTES) {
        root.querySelectorAll(`[${dataAttribute}]`).forEach((element) => {
            const key = element.getAttribute(dataAttribute);
            if (isStaticTextKey(texts, key)) element.setAttribute(attribute, texts[key]);
        });
    }
}
