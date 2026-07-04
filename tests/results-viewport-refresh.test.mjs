import test from "node:test";
import assert from "node:assert/strict";
import { setupResultsViewportRefresh } from "../_build/app/lib/render/results-viewport-refresh.mjs";
import { installFakeDom, setGlobalValue } from "./test-helpers.mjs";

test("results viewport refresh: resize refreshes recommendations before masonry layout", () => {
    const restoreDom = installFakeDom();
    const previousResizeObserver = globalThis.ResizeObserver;
    const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
    try {
        let resizeCallback = null;
        let observedElement = null;
        let queuedFrame = null;
        class FakeResizeObserver {
            constructor(callback) {
                resizeCallback = callback;
            }

            observe(element) {
                observedElement = element;
            }

            disconnect() {
                observedElement = null;
            }
        }
        setGlobalValue("ResizeObserver", FakeResizeObserver);
        setGlobalValue("requestAnimationFrame", (callback) => {
            queuedFrame = callback;
            return 1;
        });
        setGlobalValue("cancelAnimationFrame", () => {});
        window.removeEventListener = (type) => {
            window._events.delete(type);
        };

        const resultList = document.createElement("ol");
        resultList._clientWidth = 320;
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

        assert.equal(observedElement, resultList);
        resizeCallback([{ target: resultList, contentRect: { width: 640 } }]);
        assert.equal(recommendationRefreshCount, 0);

        queuedFrame();
        assert.equal(scrollObserverSetupCount, 1);
        assert.equal(recommendationRefreshCount, 1);
        assert.equal(layoutRefreshCount, 0);

        disconnect();
        assert.equal(observedElement, null);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        setGlobalValue("cancelAnimationFrame", previousCancelAnimationFrame);
        restoreDom();
    }
});

test("results viewport refresh: non-recommended resize refreshes masonry layout", () => {
    const restoreDom = installFakeDom();
    const previousResizeObserver = globalThis.ResizeObserver;
    try {
        setGlobalValue("ResizeObserver", undefined);
        window.removeEventListener = (type) => {
            window._events.delete(type);
        };

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

        window._events.get("resize")();

        assert.equal(scrollObserverSetupCount, 1);
        assert.equal(recommendationRefreshCount, 1);
        assert.equal(layoutRefreshCount, 1);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        restoreDom();
    }
});
