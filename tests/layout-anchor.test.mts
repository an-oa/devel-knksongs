import test from "node:test";
import assert from "node:assert/strict";
import { afterAnimationFrames, afterLayoutSettled } from "../app/lib/layout-anchor.mts";
import { installFakeDom, installFakeAnimationFrames } from "./test-helpers.mts";

test("layout anchor: afterAnimationFrames waits for the requested frame count", async () => {
    const cleanup = installFakeDom();
    const frames = installFakeAnimationFrames();
    try {
        const calls: string[] = [];
        const pending = afterAnimationFrames(3, () => {
            calls.push("done");
            return "ok";
        });

        assert.deepEqual(calls, []);
        assert.equal(frames.pendingCount, 1);

        while (frames.pendingCount > 0) {
            frames.advanceFrame();
            if (calls.length > 0) break;
        }

        const result = await pending;
        assert.equal(result, "ok");
        assert.deepEqual(calls, ["done"]);
    } finally {
        frames.cleanup();
        cleanup();
    }
});

test("layout anchor: afterLayoutSettled waits for two frames", async () => {
    const cleanup = installFakeDom();
    const frames = installFakeAnimationFrames();
    try {
        const calls: string[] = [];
        const pending = afterLayoutSettled(() => {
            calls.push("settled");
        });

        assert.deepEqual(calls, []);
        assert.equal(frames.pendingCount, 1);

        frames.advanceFrame();
        assert.deepEqual(calls, []);
        assert.equal(frames.pendingCount, 1);

        frames.advanceFrame();
        await pending;

        assert.deepEqual(calls, ["settled"]);
    } finally {
        frames.cleanup();
        cleanup();
    }
});
