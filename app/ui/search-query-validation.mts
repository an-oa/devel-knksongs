import { parseSearchQuery } from "../lib/search-filters.mjs";

type SearchQueryValidationInput = {
    value: string;
    validationMessage?: string;
    setCustomValidity?: (message: string) => void;
    setAttribute?: (name: string, value: string) => void;
    removeAttribute?: (name: string) => void;
};

type SearchQueryValidationMessageElement = {
    hidden: HTMLElement["hidden"];
    textContent: string | null;
};

/**
 * 検索語の日付演算子を検証し、表示用のエラーメッセージを返す。
 * 境界条件を単体テストするため export している。
 * @param {string | null | undefined} queryRaw
 * @returns {string}
 */
export function getSearchQueryValidationMessage(queryRaw: string | null | undefined): string {
    const parsedQuery = parseSearchQuery(queryRaw);
    const messages: string[] = [];
    if (parsedQuery.invalidOperators.length > 0) {
        messages.push(
            "日付演算子は YYYY、YYYY-MM、YYYY-MM-DD 形式の実在する日付で入力してください。" +
            "文字列として検索する場合は二重引用符で囲んでください。"
        );
    }
    if (parsedQuery.hasUnterminatedQuote) {
        messages.push("二重引用符が閉じられていません。");
    }
    if (parsedQuery.hasContradictoryDateRange) {
        messages.push("since の日付は until の日付以前にしてください。");
    }
    return messages.join(" ");
}

/**
 * 検索入力のカスタム検証状態とインラインメッセージを消去する。
 * @param {SearchQueryValidationInput | null | undefined} searchBox
 * @param {SearchQueryValidationMessageElement | null | undefined} errorElement
 */
export function clearSearchQueryValidation(
    searchBox: SearchQueryValidationInput | null | undefined,
    errorElement: SearchQueryValidationMessageElement | null | undefined
): void {
    if (searchBox) {
        searchBox.setCustomValidity?.("");
        searchBox.removeAttribute?.("aria-invalid");
    }
    if (errorElement) {
        errorElement.textContent = "";
        errorElement.hidden = true;
    }
}

/**
 * 検索入力の操作完了時に日付演算子を検証し、視覚表示と ARIA 状態を同期する。
 * @param {SearchQueryValidationInput | null | undefined} searchBox
 * @param {SearchQueryValidationMessageElement | null | undefined} errorElement
 * @returns {boolean}
 */
export function validateSearchQueryInput(
    searchBox: SearchQueryValidationInput | null | undefined,
    errorElement: SearchQueryValidationMessageElement | null | undefined
): boolean {
    if (!searchBox) return true;
    const message = getSearchQueryValidationMessage(searchBox.value);
    if (message === "") {
        clearSearchQueryValidation(searchBox, errorElement);
        return true;
    }

    if (searchBox.validationMessage !== message) searchBox.setCustomValidity?.(message);
    searchBox.setAttribute?.("aria-invalid", "true");
    if (errorElement) {
        if (errorElement.textContent !== message) errorElement.textContent = message;
        errorElement.hidden = false;
    }
    return false;
}

/**
 * 修正中の検索語が有効になった場合だけ、表示済みの検証エラーを即時に消去する。
 * @param {SearchQueryValidationInput | null | undefined} searchBox
 * @param {SearchQueryValidationMessageElement | null | undefined} errorElement
 * @returns {boolean}
 */
export function clearSearchQueryValidationIfValid(
    searchBox: SearchQueryValidationInput | null | undefined,
    errorElement: SearchQueryValidationMessageElement | null | undefined
): boolean {
    if (!searchBox || getSearchQueryValidationMessage(searchBox.value) !== "") return false;
    clearSearchQueryValidation(searchBox, errorElement);
    return true;
}
