import test from "node:test";
import assert from "node:assert/strict";
import { setupResultsViewportRefresh } from "../app/lib/render/results-viewport-refresh.mts";
import { getFakeElement, installFakeDom, setGlobalValue, installFakeAnimationFrames, invokeListener } from "./test-helpers.mts";

test("results viewport refresh: resize lays out the results before refreshing recommendations", () => {
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
        const calls: string[] = [];
        const disconnect = setupResultsViewportRefresh({
            resultList,
            refreshRecommendedDisplay() {
                calls.push("recommendations");
                return true;
            },
            refreshLayout() {
                calls.push("layout");
            }
        });

        const observer = observers[0];
        assert.ok(observer);
        assert.equal(observer.observedElement, resultList);
        observer.resize(640);
        assert.deepEqual(calls, []);

        frames.advanceFrame();
        assert.deepEqual(calls, ["layout", "recommendations"]);

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
        setupResultsViewportRefresh({
            resultList: document.createElement("ol"),
            refreshRecommendedDisplay() {
                recommendationRefreshCount += 1;
                return false;
            },
            refreshLayout() {
                layoutRefreshCount += 1;
            }
        });

        invokeListener(restoreDom.window, "resize", {});

        assert.equal(recommendationRefreshCount, 1);
        assert.equal(layoutRefreshCount, 1);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        restoreDom();
    }
});

test("results viewport refresh: disconnect removes the listeners and cancels the pending frames", () => {
    const cleanup = installFakeDom();
    const frames = installFakeAnimationFrames();
    const previousResizeObserver = globalThis.ResizeObserver;
    try {
        setGlobalValue("ResizeObserver", undefined);
        let layoutCalls = 0;
        const disconnect = setupResultsViewportRefresh({
            resultList: document.createElement("ol"),
            refreshRecommendedDisplay: () => false,
            refreshLayout: () => { layoutCalls += 1; }
        });

        invokeListener(cleanup.window, "resize", {});
        frames.advanceFrame();
        assert.equal(layoutCalls, 1);

        invokeListener(cleanup.window, "resize", {});
        invokeListener(cleanup.window, "scroll", {});
        assert.equal(frames.pendingCount, 1);
        disconnect();

        assert.equal(frames.pendingCount, 0);
        assert.equal(cleanup.window._events.has("resize"), false);
        assert.equal(cleanup.window._events.has("scroll"), false);
        assert.equal(layoutCalls, 1);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        frames.cleanup();
        cleanup();
    }
});

/**
 * 指定した下端の位置を持つ結果カードを並べた一覧を作り、ページへ置く。
 * @param bottoms 各カードの下端の位置
 */
function createResultListWithCards(bottoms: number[]) {
    const resultList = document.createElement("ol");
    const cards = bottoms.map((bottom) => {
        const card = document.createElement("li");
        card.className = "song-card";
        getFakeElement(card)._rect = { top: bottom - 100, bottom, left: 0, right: 100, width: 100, height: 100 };
        return card;
    });
    resultList.append(...cards);
    document.body.appendChild(resultList);
    return { resultList, cards };
}

test("results viewport refresh: resize restores the reading position recorded before the resize", () => {
    const restoreDom = installFakeDom();
    const previousResizeObserver = globalThis.ResizeObserver;
    try {
        setGlobalValue("ResizeObserver", undefined);
        const { resultList, cards } = createResultListWithCards([-40, 60, 160]);
        Object.assign(getFakeElement(document.body), { scrollTop: 500 });
        const calls: string[] = [];
        Object.assign(restoreDom.window, {
            scrollBy(options: ScrollToOptions) {
                calls.push(`scroll ${options.top}`);
            }
        });
        setupResultsViewportRefresh({
            resultList,
            refreshRecommendedDisplay() {
                calls.push("recommendations");
                return false;
            },
            refreshLayout() {
                calls.push("layout");
                getFakeElement(cards[1])._rect = { top: 140, bottom: 240, left: 0, right: 100, width: 100, height: 100 };
            },
            onReadingPositionRestored() {
                calls.push("restored");
            }
        });

        // スクロールしたときに、上端から -40 の 2 枚目を読んでいる位置として記録する。
        invokeListener(restoreDom.window, "scroll", {});
        // リサイズが知らされる前に、ブラウザがカードを動かした状態にする。この位置は使わない。
        getFakeElement(cards[1])._rect = { top: 300, bottom: 400, left: 0, right: 100, width: 100, height: 100 };
        invokeListener(restoreDom.window, "resize", {});

        // 記録した -40 へ戻し、位置を合わせた後の画面で、おすすめを減らすときに残すカードを数える。
        assert.deepEqual(calls, ["layout", "scroll 180", "restored", "recommendations"]);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        restoreDom();
    }
});

test("results viewport refresh: resize at the top of the page keeps the page at the top", () => {
    const restoreDom = installFakeDom();
    const previousResizeObserver = globalThis.ResizeObserver;
    try {
        setGlobalValue("ResizeObserver", undefined);
        const { resultList, cards } = createResultListWithCards([160, 260]);
        Object.assign(getFakeElement(document.body), { scrollTop: 0 });
        const scrollCalls: (number | undefined)[] = [];
        Object.assign(restoreDom.window, {
            scrollBy(options: ScrollToOptions) {
                scrollCalls.push(options.top);
            }
        });
        let layoutRefreshCount = 0;
        let restoredCount = 0;
        setupResultsViewportRefresh({
            resultList,
            refreshRecommendedDisplay: () => false,
            refreshLayout() {
                layoutRefreshCount += 1;
                getFakeElement(cards[0])._rect = { top: 110, bottom: 210, left: 0, right: 100, width: 100, height: 100 };
            },
            onReadingPositionRestored() {
                restoredCount += 1;
            }
        });

        invokeListener(restoreDom.window, "scroll", {});
        invokeListener(restoreDom.window, "resize", {});

        assert.equal(layoutRefreshCount, 1);
        assert.deepEqual(scrollCalls, []);
        assert.equal(restoredCount, 0);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        restoreDom();
    }
});

test("results viewport refresh: a scroll reported before the pending layout keeps the record from before the resize", () => {
    const restoreDom = installFakeDom();
    const frames = installFakeAnimationFrames();
    const previousResizeObserver = globalThis.ResizeObserver;
    try {
        setGlobalValue("ResizeObserver", undefined);
        const { resultList, cards } = createResultListWithCards([-40, 60, 160]);
        Object.assign(getFakeElement(document.body), { scrollTop: 500 });
        const scrollCalls: (number | undefined)[] = [];
        Object.assign(restoreDom.window, {
            scrollBy(options: ScrollToOptions) {
                scrollCalls.push(options.top);
            }
        });
        setupResultsViewportRefresh({
            resultList,
            refreshRecommendedDisplay: () => false,
            refreshLayout() {
                getFakeElement(cards[1])._rect = { top: 140, bottom: 240, left: 0, right: 100, width: 100, height: 100 };
            }
        });

        invokeListener(restoreDom.window, "scroll", {});
        invokeListener(restoreDom.window, "resize", {});
        // リサイズ後、並び直す前に届いたスクロールでは、ブラウザが動かした位置を記録しない。
        getFakeElement(cards[0])._rect = { top: -20, bottom: 80, left: 0, right: 100, width: 100, height: 100 };
        invokeListener(restoreDom.window, "scroll", {});
        frames.advanceFrame();

        assert.deepEqual(scrollCalls, [180]);
    } finally {
        setGlobalValue("ResizeObserver", previousResizeObserver);
        frames.cleanup();
        restoreDom();
    }
});
