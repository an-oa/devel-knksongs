import test from "node:test";
import assert from "node:assert/strict";
import { scheduleScrollElementIntoView, scrollResultListToTop } from "../_build/app/lib/results-scroll.mjs";
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

test("scroll: scheduleScrollElementIntoView waits for layout settling before scrolling", async () => {
    const cleanup = installFakeDom();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const frameQueue = [];
    globalThis.requestAnimationFrame = (callback) => {
        frameQueue.push(callback);
        return frameQueue.length;
    };
    try {
        const container = document.createElement("div");
        container._scrollHeight = 500;
        container._clientHeight = 200;
        container.scrollTop = 0;
        container.scrollToCalls = [];
        container.scrollTo = (options) => {
            container.scrollToCalls.push(options);
        };
        container._rect = { top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200 };
        const target = document.createElement("div");
        target._rect = { top: 350, bottom: 450, left: 0, right: 200, width: 200, height: 100 };
        document.body.appendChild(container);
        container.appendChild(target);
        window.getComputedStyle = (element) => ({
            overflowY: element === container ? "auto" : "visible"
        });

        const pending = scheduleScrollElementIntoView(target, {
            topOffset: 20,
            behavior: "smooth"
        });

        assert.deepEqual(container.scrollToCalls, []);
        assert.equal(frameQueue.length, 1);

        frameQueue.shift()();
        assert.deepEqual(container.scrollToCalls, []);
        assert.equal(frameQueue.length, 1);

        frameQueue.shift()();
        await pending;

        assert.deepEqual(container.scrollToCalls, [{ top: 230, behavior: "smooth" }]);
    } finally {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
        cleanup();
    }
});

test("scroll: force option aligns a visible element with the scroll top offset", async () => {
    const cleanup = installFakeDom();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const frameQueue = [];
    globalThis.requestAnimationFrame = (callback) => {
        frameQueue.push(callback);
        return frameQueue.length;
    };
    try {
        const container = document.createElement("div");
        container._scrollHeight = 500;
        container._clientHeight = 200;
        container.scrollTop = 100;
        container.scrollToCalls = [];
        container.scrollTo = (options) => {
            container.scrollToCalls.push(options);
        };
        container._rect = { top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200 };
        const target = document.createElement("div");
        target._rect = { top: 150, bottom: 250, left: 0, right: 200, width: 200, height: 100 };
        document.body.appendChild(container);
        container.appendChild(target);
        window.getComputedStyle = (element) => ({
            overflowY: element === container ? "auto" : "visible"
        });

        const pending = scheduleScrollElementIntoView(target, {
            topOffset: 20,
            behavior: "smooth",
            force: true
        });

        frameQueue.shift()();
        frameQueue.shift()();
        await pending;

        assert.deepEqual(container.scrollToCalls, [{ top: 130, behavior: "smooth" }]);
    } finally {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
        cleanup();
    }
});
