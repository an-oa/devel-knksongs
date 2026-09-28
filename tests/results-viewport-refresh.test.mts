import test from "node:test";
import assert from "node:assert/strict";
import { createResultTailFallbackObserver } from "../app/lib/render/result-tail-fallback.mts";
import { setupResultsViewportRefresh } from "../app/lib/render/results-viewport-refresh.mts";
import { getFakeElement, installFakeDom, setGlobalValue, installFakeAnimationFrames, invokeListener } from "./test-helpers.mts";

test("results viewport refresh: resize refreshes recommendations before masonry layout", () => {
    const restoreDom = installFakeDom();
    const previousResizeObserver = globalThis.ResizeObserver;
    const frames = installFakeAnimationFrames();
    try {
        const observers: FakeResizeObserver[] = [];
        class FakeResizeObserver implements ResizeObserver {
            readonly callback: ResizeObserverCallback;
            observedElement: Element | null = null;

            constructor(callback: ResizeObserverCallback) {
                this.callback = callback;
                observers.push(this);
            }

            /** リサイズ監視対象を記録する。 */
            observe(element: Element) { this.observedElement = element; }

            /** 対象の監視を解除する。 */
            unobserve(element: Element) {
                if (this.observedElement === element) this.observedElement = null;
            }

            /** 監視解除を記録する。 */
            disconnect() { this.observedElement = null; }

            /** 監視対象の新しい幅を通知する。 */
            resize(width: number) {
                assert.ok(this.observedElement);
                this.callback([{
                    target: this.observedElement,
                    contentRect: { ...this.observedElement.getBoundingClientRect(), width, toJSON() { return {}; } },
                    borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: []
                }], this);
            }
        }
        globalThis.ResizeObserver = FakeResizeObserver;

        const resultList = document.createElement("ol");
        getFakeElement(resultList)._clientWidth = 320;
        let recommendationRefreshCount = 0;
        let layoutRefreshCount = 0;
        let scrollObserverSetupCount = 0;
        const disconnect = setupResultsViewportRefresh({
            resultList,
            refreshRecommendedDisplay() {
                recommendationRefreshCount += 1;
                return true;
            },
            refreshLayout() {
                layoutRefreshCount += 1;
            },
            setupScrollObserver() {
                scrollObserverSetupCount += 1;
            }
        });

        const observer = observers[0];
        assert.ok(observer);
        assert.equal(observer.observedElement, resultList);
        observer.resize(640);
        assert.equal(recommendationRefreshCount, 0);

        frames.advanceFrame();
        assert.equal(scrollObserverSetupCount, 1);
        assert.equal(recommendationRefreshCount, 1);
        assert.equal(layoutRefreshCount, 0);

        disconnect();
        assert.equal(observer.observedElement, null);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        frames.cleanup();
        restoreDom();
    }
});

test("results viewport refresh: non-recommended resize refreshes masonry layout", () => {
    const restoreDom = installFakeDom();
    const previousResizeObserver = globalThis.ResizeObserver;
    try {
        setGlobalValue("ResizeObserver", undefined);

        let recommendationRefreshCount = 0;
        let layoutRefreshCount = 0;
        let scrollObserverSetupCount = 0;
        setupResultsViewportRefresh({
            resultList: document.createElement("ol"),
            refreshRecommendedDisplay() {
                recommendationRefreshCount += 1;
                return false;
            },
            refreshLayout() {
                layoutRefreshCount += 1;
            },
            setupScrollObserver() {
                scrollObserverSetupCount += 1;
            }
        });

        invokeListener(restoreDom.window, "resize", {});

        assert.equal(scrollObserverSetupCount, 1);
        assert.equal(recommendationRefreshCount, 1);
        assert.equal(layoutRefreshCount, 1);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        restoreDom();
    }
});

for (const removed of ["tail", "viewport"] as const) {
    test(`results viewport refresh: resize observers coexist after disconnecting ${removed}`, () => {
        const cleanup = installFakeDom();
        const frames = installFakeAnimationFrames();
        const previousResizeObserver = globalThis.ResizeObserver;
        try {
            setGlobalValue("ResizeObserver", undefined);
            const resultList = document.createElement("ol");
            const sentinel = document.createElement("div");
            document.body.append(resultList, sentinel);
            getFakeElement(sentinel)._rect = { top: 2000, bottom: 2001, left: 0, right: 1, width: 1, height: 1 };
            let tailCalls = 0;
            let layoutCalls = 0;
            const tail = createResultTailFallbackObserver({
                getSentinel: () => sentinel,
                hasMoreResults: () => true,
                extendDisplayedResults: () => { tailCalls += 1; return true; },
                prefetchMarginPx: 0
            });
            tail.observe();
            const disconnectViewport = setupResultsViewportRefresh({
                resultList,
                refreshRecommendedDisplay: () => false,
                refreshLayout: () => { layoutCalls += 1; },
                setupScrollObserver() {}
            });

            getFakeElement(sentinel)._rect = { top: 100, bottom: 101, left: 0, right: 1, width: 1, height: 1 };
            invokeListener(cleanup.window, "resize", {});
            frames.advanceFrame();
            assert.equal(tailCalls, 1);
            assert.equal(layoutCalls, 1);

            if (removed === "tail") tail.disconnect();
            else disconnectViewport();
            invokeListener(cleanup.window, "resize", {});
            if (removed === "tail") frames.advanceFrame();
            assert.equal(tailCalls, removed === "tail" ? 1 : 2);
            assert.equal(layoutCalls, removed === "viewport" ? 1 : 2);

            tail.disconnect();
            disconnectViewport();
            assert.equal(cleanup.window._events.has("resize"), false);
            assert.equal(frames.pendingCount, 0);
        } finally {
            setGlobalValue("ResizeObserver", previousResizeObserver);
            frames.cleanup();
            cleanup();
        }
    });
}
