import test from "node:test";
import assert from "node:assert/strict";
import { createDragAutoScroller, getAutoScrollStep } from "../app/lib/render/drag-auto-scroll.mts";
import { getFakeElement, installFakeAnimationFrames, installFakeDom } from "./test-helpers.mts";

test("drag auto scroll: scrolls only within 48px of the visible edges, faster closer to the edge", () => {
    const edges = { top: 0, bottom: 720 };
    assert.equal(getAutoScrollStep(300, edges), 0);
    // 上端から 48px ちょうどは端の外、47px は端の中。端に近いほど速く、端を越えると最も速い。
    assert.equal(getAutoScrollStep(48, edges), 0);
    assert.equal(getAutoScrollStep(47, edges), -1);
    assert.equal(getAutoScrollStep(24, edges), -8);
    assert.equal(getAutoScrollStep(0, edges), -16);
    assert.equal(getAutoScrollStep(-30, edges), -16);
    assert.equal(getAutoScrollStep(672, edges), 0);
    assert.equal(getAutoScrollStep(673, edges), 1);
    assert.equal(getAutoScrollStep(719, edges), 16);
    assert.equal(getAutoScrollStep(760, edges), 16);
});

test("drag auto scroll: the top edge is the bottom of the visible header", () => {
    const edges = { top: 64, bottom: 720 };
    assert.equal(getAutoScrollStep(112, edges), 0);
    assert.equal(getAutoScrollStep(111, edges), -1);
    // ヘッダーの上は、端を越えたところとして最も速くする。
    assert.equal(getAutoScrollStep(30, edges), -16);
});

test("drag auto scroll: a view too short for both edge zones or a missing position does not scroll", () => {
    assert.equal(getAutoScrollStep(10, { top: 0, bottom: 96 }), 0);
    assert.equal(getAutoScrollStep(90, { top: 0, bottom: 96 }), 0);
    assert.equal(getAutoScrollStep(Number.NaN, { top: 0, bottom: 720 }), 0);
});

test("drag auto scroll: scrolls every frame near the edge and reports only frames that moved the page", () => {
    const dom = installFakeDom();
    const frames = installFakeAnimationFrames();
    try {
        // ヘッダーは画面の上に 64px 出ている。
        const header = document.createElement("header");
        header.className = "header";
        getFakeElement(header)._rect = { top: 0, bottom: 64, left: 0, right: 300, width: 300, height: 64 };
        document.body.appendChild(header);
        const scrolls: number[] = [];
        Object.assign(dom.window, {
            scrollY: 30,
            scrollBy(options: ScrollToOptions) {
                const step = options.top ?? 0;
                scrolls.push(step);
                // ページの先頭より上へはスクロールしない。
                Object.assign(dom.window, { scrollY: Math.max(0, Reflect.get(dom.window, "scrollY") + step) });
            }
        });
        let scrolledCount = 0;
        const scroller = createDragAutoScroller(() => { scrolledCount += 1; });

        // ヘッダーの上（端を越えたところ）にいるので、最も速く上へスクロールする。
        scroller.follow(40);
        assert.equal(frames.pendingCount, 1);
        frames.advanceFrame();
        frames.advanceFrame();
        assert.deepEqual(scrolls, [-16, -16]);
        assert.equal(scrolledCount, 2);

        // 先頭に着いて動かなくなっても、端にいる間はフレームごとに試す。動かなかったフレームは知らせない。
        frames.advanceFrame();
        assert.deepEqual(scrolls, [-16, -16, -16]);
        assert.equal(scrolledCount, 2);
        assert.equal(frames.pendingCount, 1);

        scroller.stop();
        assert.equal(frames.pendingCount, 0);
    } finally {
        frames.cleanup();
        dom();
    }
});

test("drag auto scroll: following a pointer away from the edges schedules no frame", () => {
    const dom = installFakeDom();
    const frames = installFakeAnimationFrames();
    try {
        const scroller = createDragAutoScroller(() => {});
        scroller.follow(300);
        assert.equal(frames.pendingCount, 0);
        // 予約していないときに止めても、何も起きない。
        scroller.stop();
        assert.equal(frames.pendingCount, 0);
    } finally {
        frames.cleanup();
        dom();
    }
});
