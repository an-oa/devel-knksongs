import test from "node:test";
import assert from "node:assert/strict";
import { parseSearchQuery } from "../_build/app/lib/search-query.mjs";
import {
    clearSearchQueryValidation,
    clearSearchQueryValidationIfValid,
    getSearchQueryValidationMessage,
    validateSearchQueryInput
} from "../_build/app/ui/search-query-validation.mjs";

test("search query validation: exposes errors on completion and clears them during correction", () => {
    const attributes = new Map();
    const searchBox = {
        value: "since:2024-02-30",
        validationMessage: "",
        setCustomValidity(message) {
            this.validationMessage = message;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        removeAttribute(name) {
            attributes.delete(name);
        }
    };
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
    const attributes = new Map([["aria-invalid", "true"]]);
    const searchBox = {
        value: "until:2026-13",
        validationMessage: "existing error",
        setCustomValidity(message) {
            this.validationMessage = message;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        removeAttribute(name) {
            attributes.delete(name);
        }
    };
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
