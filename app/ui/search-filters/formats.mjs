import { getFormatFilterLabel } from "../../lib/format-filter.mjs?v=18";

const FORMAT_CHECKBOX_SELECTOR = 'input[type="checkbox"]';

/**
 * フォーマットフィルタのチェックボックス UI を構築する。
 * @param {{
 *   searchUi: { selectedFormats: Set<string> },
 *   formatsList?: HTMLElement | null,
 *   defaultFormats: string[],
 *   onChange?: (event: Event) => void
 * }} input
 * @returns {boolean}
 */
export function renderSearchFormatOptions(input) {
    const {
        searchUi,
        formatsList,
        defaultFormats,
        onChange
    } = input;
    if (!formatsList || formatsList.childElementCount > 0) return false;
    if (searchUi.selectedFormats.size === 0) {
        defaultFormats.forEach((format) => searchUi.selectedFormats.add(format));
    }
    if (typeof document === "undefined" || typeof formatsList.appendChild !== "function") {
        syncSearchFormatCheckboxes({ searchUi, formatsList });
        return false;
    }
    defaultFormats.forEach((format) => {
        const label = document.createElement("label");
        label.className = "checkbox-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = format;
        checkbox.addEventListener("change", (event) => {
            if (checkbox.checked) searchUi.selectedFormats.add(checkbox.value);
            else searchUi.selectedFormats.delete(checkbox.value);
            if (typeof onChange === "function") onChange(event);
        });
        label.append(checkbox, ` ${getFormatFilterLabel(format)}`);
        formatsList.appendChild(label);
    });
    syncSearchFormatCheckboxes({ searchUi, formatsList });
    return true;
}

/**
 * state上のフォーマット選択状態をチェックボックスへ同期する。
 * @param {{
 *   searchUi: { selectedFormats: Set<string> },
 *   formatsList?: { querySelectorAll: (selector: string) => Iterable<{ value: string, checked: boolean }> } | null
 * }} input
 */
export function syncSearchFormatCheckboxes(input) {
    const { searchUi, formatsList } = input;
    if (!formatsList) return;
    const formatCheckboxes = Array.from(formatsList.querySelectorAll(FORMAT_CHECKBOX_SELECTOR));
    formatCheckboxes.forEach((checkbox) => {
        checkbox.checked = searchUi.selectedFormats.has(checkbox.value);
    });
}
