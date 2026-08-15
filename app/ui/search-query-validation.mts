import { hasSearchQueryIssues, parseSearchQuery } from "../lib/search-query.mjs";
import type { ParsedSearchQuery, SearchQueryIssue } from "../lib/search-query.mjs";

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
 * 検索クエリの問題を利用者向けのエラーメッセージへ変換する。
 * issueの追加時に文言の対応漏れを型検査で検出するため、網羅的に分岐する。
 * @param issue 検索クエリの問題
 * @returns 利用者向けエラーメッセージ
 */
function getSearchQueryIssueMessage(issue: SearchQueryIssue): string {
    switch (issue.code) {
        case "invalid-date-operator":
            return "日付演算子は YYYY、YYYY-MM、YYYY-MM-DD 形式の実在する日付で入力してください。" +
                "文字列として検索する場合は二重引用符で囲んでください。";
        case "unterminated-quote":
            return "二重引用符が閉じられていません。";
        case "contradictory-date-range":
            return "since の日付は until の日付以前にしてください。";
    }
    return assertUnreachableSearchQueryIssue(issue);
}

/**
 * 検索クエリの問題種別が網羅されていることを型検査する。
 * @param issue 到達しない問題
 */
function assertUnreachableSearchQueryIssue(issue: never): never {
    throw new Error(`Unsupported search query issue: ${JSON.stringify(issue)}`);
}

/**
 * 解析済み検索語の問題を、重複を除いた表示用メッセージへ変換する。
 * 同種の無効な日付演算子が複数あっても説明文は1回だけ表示する。
 * 境界条件を単体テストするためexportしている。
 * @param parsedQuery 解析済み検索語
 * @returns 表示用エラーメッセージ
 */
export function getSearchQueryValidationMessage(parsedQuery: ParsedSearchQuery): string {
    const displayedCodes = new Set<SearchQueryIssue["code"]>();
    return parsedQuery.issues
        .filter((issue) => {
            if (displayedCodes.has(issue.code)) return false;
            displayedCodes.add(issue.code);
            return true;
        })
        .map(getSearchQueryIssueMessage)
        .join(" ");
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
 * @param parsedQuery 同じ検索処理内で共有する解析済み検索語
 * @returns {boolean}
 */
export function validateSearchQueryInput(
    searchBox: SearchQueryValidationInput | null | undefined,
    errorElement: SearchQueryValidationMessageElement | null | undefined,
    parsedQuery?: ParsedSearchQuery
): boolean {
    if (!searchBox) return true;
    const effectiveParsedQuery = parsedQuery ?? parseSearchQuery(searchBox.value);
    if (!hasSearchQueryIssues(effectiveParsedQuery)) {
        clearSearchQueryValidation(searchBox, errorElement);
        return true;
    }

    const message = getSearchQueryValidationMessage(effectiveParsedQuery);
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
    if (!searchBox || hasSearchQueryIssues(parseSearchQuery(searchBox.value))) return false;
    clearSearchQueryValidation(searchBox, errorElement);
    return true;
}
