import test from "node:test";
import assert from "node:assert/strict";
import {
    getResultTailFallbackScrollTarget,
    isResultTailNearScrollBoundary
} from "../_build/app/lib/render/result-tail-fallback.mjs";
import { installFakeDom } from "./test-helpers.mjs";

test("result tail fallback: scroll target uses window for document scroll and container otherwise", () => {
    const cleanup = installFakeDom();
    try {
        const scrollContainer = document.createElement("section");

        assert.equal(getResultTailFallbackScrollTarget(null), window);
        assert.equal(getResultTailFallbackScrollTarget(document.body), window);
        assert.equal(getResultTailFallbackScrollTarget(scrollContainer), scrollContainer);
    } finally {
        cleanup();
    }
});

test("result tail fallback: boundary checks use viewport or scroll container edges", () => {
    const cleanup = installFakeDom();
    try {
        const sentinel = document.createElement("div");
        const scrollContainer = document.createElement("section");
        scrollContainer._rect = { top: 100, bottom: 500, left: 0, right: 500, width: 500, height: 400 };

        sentinel._rect = { top: 1200, bottom: 1201, left: 0, right: 1, width: 1, height: 1 };
        assert.equal(isResultTailNearScrollBoundary(sentinel, 480, null), true);

        sentinel._rect = { top: 1201, bottom: 1202, left: 0, right: 1, width: 1, height: 1 };
        assert.equal(isResultTailNearScrollBoundary(sentinel, 480, null), false);

        sentinel._rect = { top: 900, bottom: 901, left: 0, right: 1, width: 1, height: 1 };
        assert.equal(isResultTailNearScrollBoundary(sentinel, 400, scrollContainer), true);

        sentinel._rect = { top: 901, bottom: 902, left: 0, right: 1, width: 1, height: 1 };
        assert.equal(isResultTailNearScrollBoundary(sentinel, 400, scrollContainer), false);

        sentinel._rect = { top: 0, bottom: 99, left: 0, right: 1, width: 1, height: 99 };
        assert.equal(isResultTailNearScrollBoundary(sentinel, 400, scrollContainer), false);
    } finally {
        cleanup();
    }
});
