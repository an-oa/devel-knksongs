import test from "node:test";
import assert from "node:assert/strict";
import { scrollResultListToTop } from "../app/lib/results-scroll.mjs";
import { installFakeDom } from "./test-helpers.mjs";

test("scroll: falls back to window scroll when result list has no scrollable ancestor", () => {
    const cleanup = installFakeDom();
    try {
        const resultList = document.createElement("div");
        document.body.appendChild(resultList);
        const calls = [];
        window.scrollTo = (options) => {
            calls.push(options);
        };

        scrollResultListToTop(resultList);

        assert.deepEqual(calls, [{ top: 0, behavior: "auto" }]);
    } finally {
        cleanup();
    }
});

test("scroll: uses nearest scrollable ancestor when present", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        container._scrollHeight = 500;
        container._clientHeight = 200;
        container.scrollToCalls = [];
        container.scrollTo = (options) => {
            container.scrollToCalls.push(options);
        };
        const resultList = document.createElement("div");
        document.body.appendChild(container);
        container.appendChild(resultList);
        window.getComputedStyle = (element) => ({
            overflowY: element === container ? "auto" : "visible"
        });
        let windowScrollCalls = 0;
        window.scrollTo = () => {
            windowScrollCalls += 1;
        };

        scrollResultListToTop(resultList);

        assert.deepEqual(container.scrollToCalls, [{ top: 0, behavior: "auto" }]);
        assert.equal(windowScrollCalls, 0);
    } finally {
        cleanup();
    }
});
