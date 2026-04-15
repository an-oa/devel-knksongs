import test from "node:test";
import assert from "node:assert/strict";
import { afterAnimationFrames, afterLayoutSettled } from "../app/lib/layout-anchor.mjs";
import { installFakeDom, setGlobalValue } from "./test-helpers.mjs";

test("layout anchor: afterAnimationFrames waits for the requested frame count", async () => {
    const cleanup = installFakeDom();
    const previousRaf = globalThis.requestAnimationFrame;
    const rafQueue = [];
    setGlobalValue("requestAnimationFrame", (cb) => {
        rafQueue.push(cb);
        return rafQueue.length;
    });
    try {
        const calls = [];
        const pending = afterAnimationFrames(3, () => {
            calls.push("done");
            return "ok";
        });

        assert.deepEqual(calls, []);
        assert.equal(rafQueue.length, 1);

        while (rafQueue.length > 0) {
            const callback = rafQueue.shift();
            if (typeof callback === "function") callback();
            if (calls.length > 0) break;
        }

        const result = await pending;
        assert.equal(result, "ok");
        assert.deepEqual(calls, ["done"]);
    } finally {
        setGlobalValue("requestAnimationFrame", previousRaf);
        cleanup();
    }
});

test("layout anchor: afterLayoutSettled waits for two frames", async () => {
    const cleanup = installFakeDom();
    const previousRaf = globalThis.requestAnimationFrame;
    const rafQueue = [];
    setGlobalValue("requestAnimationFrame", (cb) => {
        rafQueue.push(cb);
        return rafQueue.length;
    });
    try {
        const calls = [];
        const pending = afterLayoutSettled(() => {
            calls.push("settled");
        });

        assert.deepEqual(calls, []);
        assert.equal(rafQueue.length, 1);

        const firstFrame = rafQueue.shift();
        firstFrame();
        assert.deepEqual(calls, []);
        assert.equal(rafQueue.length, 1);

        const secondFrame = rafQueue.shift();
        secondFrame();
        await pending;

        assert.deepEqual(calls, ["settled"]);
    } finally {
        setGlobalValue("requestAnimationFrame", previousRaf);
        cleanup();
    }
});
