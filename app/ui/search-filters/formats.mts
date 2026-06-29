import { getFormatFilterLabel } from "../../lib/format-filter.mjs";

const FORMAT_CHECKBOX_SELECTOR = 'input[type="checkbox"]';

type SearchFormatCheckbox = {
    value: string;
    checked: boolean;
};

type SearchFormatCheckboxList = {
    querySelectorAll: (selector: string) => Iterable<Element | SearchFormatCheckbox> | ArrayLike<Element | SearchFormatCheckbox>;
};

type SearchFormatOptionsList = SearchFormatCheckboxList & {
    childElementCount?: number;
    appendChild?: (node: Node) => Node;
};

type SearchFormatOptionsInput = {
    selectedFormats: Set<string>;
    formatsList?: SearchFormatOptionsList | null;
    defaultFormats: string[];
    onChange?: (event: Event) => void;
};

type SearchFormatSyncInput = {
    selectedFormats: Set<string>;
    formatsList?: SearchFormatCheckboxList | null;
};

/**
 * フォーマットフィルタのチェックボックス UI を構築する。
 * @param {{
 *   selectedFormats: Set<string>,
 *   formatsList?: HTMLElement | null,
 *   defaultFormats: string[],
 *   onChange?: (event: Event) => void
 * }} input
 * @returns {boolean}
 */
export function renderSearchFormatOptions(input: SearchFormatOptionsInput): boolean {
    const {
        selectedFormats,
        formatsList,
        defaultFormats,
        onChange
    } = input;
    if (!formatsList || (formatsList.childElementCount ?? 0) > 0) return false;
    if (selectedFormats.size === 0) {
        defaultFormats.forEach((format) => selectedFormats.add(format));
    }
    if (typeof document === "undefined" || typeof formatsList.appendChild !== "function") {
        syncSearchFormatCheckboxes({ selectedFormats, formatsList });
        return false;
    }
    defaultFormats.forEach((format, index) => {
        const label = document.createElement("label");
        label.className = "checkbox-item";
        const checkbox = document.createElement("input");
        checkbox.id = `format-filter-${index}`;
        checkbox.type = "checkbox";
        checkbox.value = format;
        label.htmlFor = checkbox.id;
        checkbox.addEventListener("change", (event) => {
            if (checkbox.checked) selectedFormats.add(checkbox.value);
            else selectedFormats.delete(checkbox.value);
            if (typeof onChange === "function") onChange(event);
        });
        label.append(checkbox, ` ${getFormatFilterLabel(format)}`);
        formatsList.appendChild(label);
    });
    syncSearchFormatCheckboxes({ selectedFormats, formatsList });
    return true;
}

/**
 * state上のフォーマット選択状態をチェックボックスへ同期する。
 * @param {{
 *   selectedFormats: Set<string>,
 *   formatsList?: { querySelectorAll: (selector: string) => Iterable<{ value: string, checked: boolean }> } | null
 * }} input
 */
export function syncSearchFormatCheckboxes(input: SearchFormatSyncInput): void {
    const { selectedFormats, formatsList } = input;
    if (!formatsList) return;
    const formatCheckboxes = Array.from(formatsList.querySelectorAll(FORMAT_CHECKBOX_SELECTOR)) as SearchFormatCheckbox[];
    formatCheckboxes.forEach((checkbox) => {
        checkbox.checked = selectedFormats.has(checkbox.value);
    });
}
