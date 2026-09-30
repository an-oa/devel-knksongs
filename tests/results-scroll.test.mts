import test from "node:test";
import assert from "node:assert/strict";
import { scheduleScrollElementIntoView, scrollResultListToTop } from "../app/lib/results-scroll.mts";
import { getFakeElement, installFakeDom, installFakeAnimationFrames } from "./test-helpers.mts";

test("scroll: falls back to window scroll when result list has no scrollable ancestor", () => {
    const cleanup = installFakeDom();
    try {
        const resultList = document.createElement("div");
        document.body.appendChild(resultList);
        const calls: (ScrollToOptions | undefined)[] = [];
        cleanup.window.scrollTo = (options) => {
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
        getFakeElement(container)._scrollHeight = 500;
        getFakeElement(container)._clientHeight = 200;
        const scrollToCalls: (ScrollToOptions | undefined)[] = [];
        getFakeElement(container).scrollTo = (options) => {
            scrollToCalls.push(options);
        };
        const resultList = document.createElement("div");
        document.body.appendChild(container);
        container.appendChild(resultList);
        cleanup.window.getComputedStyle = (element) => ({
            overflowY: element === container ? "auto" : "visible"
        });
        let windowScrollCalls = 0;
        cleanup.window.scrollTo = () => {
            windowScrollCalls += 1;
        };

        scrollResultListToTop(resultList);

        assert.deepEqual(scrollToCalls, [{ top: 0, behavior: "auto" }]);
        assert.equal(windowScrollCalls, 0);
    } finally {
        cleanup();
    }
});

test("scroll: scheduleScrollElementIntoView waits for layout settling before scrolling", async () => {
    const cleanup = installFakeDom();
    const frames = installFakeAnimationFrames();
    try {
        const container = document.createElement("div");
        getFakeElement(container)._scrollHeight = 500;
        getFakeElement(container)._clientHeight = 200;
        container.scrollTop = 0;
        const scrollToCalls: (ScrollToOptions | undefined)[] = [];
        getFakeElement(container).scrollTo = (options) => {
            scrollToCalls.push(options);
        };
        getFakeElement(container)._rect = { top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200 };
        const target = document.createElement("div");
        getFakeElement(target)._rect = { top: 350, bottom: 450, left: 0, right: 200, width: 200, height: 100 };
        document.body.appendChild(container);
        container.appendChild(target);
        cleanup.window.getComputedStyle = (element) => ({
            overflowY: element === container ? "auto" : "visible"
        });

        const pending = scheduleScrollElementIntoView(target, {
            topOffset: 20,
            behavior: "smooth"
        });

        assert.deepEqual(scrollToCalls, []);
        assert.equal(frames.pendingCount, 1);

        frames.advanceFrame();
        assert.deepEqual(scrollToCalls, []);
        assert.equal(frames.pendingCount, 1);

        frames.advanceFrame();
        await pending;

        assert.deepEqual(scrollToCalls, [{ top: 230, behavior: "smooth" }]);
    } finally {
        frames.cleanup();
        cleanup();
    }
});

test("scroll: force option aligns a visible element with the scroll top offset", async () => {
    const cleanup = installFakeDom();
    const frames = installFakeAnimationFrames();
    try {
        const container = document.createElement("div");
        getFakeElement(container)._scrollHeight = 500;
        getFakeElement(container)._clientHeight = 200;
        container.scrollTop = 100;
        const scrollToCalls: (ScrollToOptions | undefined)[] = [];
        getFakeElement(container).scrollTo = (options) => {
            scrollToCalls.push(options);
        };
        getFakeElement(container)._rect = { top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200 };
        const target = document.createElement("div");
        getFakeElement(target)._rect = { top: 150, bottom: 250, left: 0, right: 200, width: 200, height: 100 };
        document.body.appendChild(container);
        container.appendChild(target);
        cleanup.window.getComputedStyle = (element) => ({
            overflowY: element === container ? "auto" : "visible"
        });

        const pending = scheduleScrollElementIntoView(target, {
            topOffset: 20,
            behavior: "smooth",
            force: true
        });

        frames.advanceFrame();
        frames.advanceFrame();
        await pending;

        assert.deepEqual(scrollToCalls, [{ top: 130, behavior: "smooth" }]);
    } finally {
        frames.cleanup();
        cleanup();
    }
});
