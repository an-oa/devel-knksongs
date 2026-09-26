import test from "node:test";
import assert from "node:assert/strict";
import { parseSearchQuery } from "../app/lib/search-query.mts";
import {
    clearSearchQueryValidation,
    clearSearchQueryValidationIfValid,
    getSearchQueryValidationMessage,
    validateSearchQueryInput
} from "../app/ui/search-query-validation.mts";

/** 検索入力の初期値と、検証メッセージ・属性の記録を持つモックを作る。 */
function createSearchInputMock(value: string, validationMessage = "") {
    const attributes = new Map<string, string>();
    const searchBox = {
        value,
        validationMessage,
        /** 検証メッセージを記録する。 */
        setCustomValidity(message: string) {
            this.validationMessage = message;
        },
        /** ARIA 属性の設定を記録する。 */
        setAttribute(name: string, value: string) {
            attributes.set(name, value);
        },
        /** 指定された属性を取り除く。 */
        removeAttribute(name: string) {
            attributes.delete(name);
        }
    };
    return { searchBox, attributes };
}

test("search query validation: exposes errors on completion and clears them during correction", () => {
    const { searchBox, attributes } = createSearchInputMock("since:2024-02-30");
    const errorElement = { hidden: true, textContent: "" };

    assert.equal(validateSearchQueryInput(searchBox, errorElement), false);
    assert.match(searchBox.validationMessage, /YYYY/);
    assert.match(searchBox.validationMessage, /二重引用符/);
    assert.equal(attributes.get("aria-invalid"), "true");
    assert.equal(errorElement.hidden, false);

    clearSearchQueryValidation(searchBox, errorElement);
    assert.equal(searchBox.validationMessage, "");
    assert.equal(attributes.has("aria-invalid"), false);
    assert.equal(errorElement.hidden, true);
    assert.equal(errorElement.textContent, "");
});

test("search query validation: keeps an existing error until input becomes valid", () => {
    const { searchBox, attributes } = createSearchInputMock("until:2026-13", "existing error");
    attributes.set("aria-invalid", "true");
    const errorElement = { hidden: false, textContent: "existing error" };

    assert.equal(clearSearchQueryValidationIfValid(searchBox, errorElement), false);
    assert.equal(errorElement.hidden, false);

    searchBox.value = '"until:2026-13"';
    assert.equal(clearSearchQueryValidationIfValid(searchBox, errorElement), true);
    assert.equal(attributes.has("aria-invalid"), false);
    assert.equal(errorElement.hidden, true);
});

test("search query validation: reports an unclosed quoted phrase", () => {
    assert.match(
        getSearchQueryValidationMessage(parseSearchQuery('"Song until:2026')),
        /閉じられていません/
    );
});

test("search query validation: explains contradictory operator bounds", () => {
    assert.match(
        getSearchQueryValidationMessage(parseSearchQuery("since:2024-02-01 until:2024-01-31")),
        /since の日付は until の日付以前/
    );
});

test("search query validation: reports every issue type and deduplicates repeated date errors", () => {
    const parsedQuery = parseSearchQuery('until: until:2026-13 since:2025 until:2024 "unfinished');
    assert.deepEqual(
        parsedQuery.issues.map((issue) => issue.code),
        [
            "invalid-date-operator",
            "invalid-date-operator",
            "unterminated-quote",
            "contradictory-date-range"
        ]
    );

    const message = getSearchQueryValidationMessage(parsedQuery);
    assert.equal(message.match(/日付演算子は/g)?.length, 1);
    assert.match(message, /二重引用符が閉じられていません/);
    assert.match(message, /since の日付は until の日付以前/);
});
