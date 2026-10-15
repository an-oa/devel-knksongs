import test from "node:test";
import assert from "node:assert/strict";
import {
    canUseDom,
    getHeaderHeight,
    getViewportHeight,
    isHtmlElement,
    isIOSWebKit
} from "../app/lib/dom-utils.mts";
import { installFakeDom, setGlobalValue } from "./test-helpers.mts";

test("dom utils: isHtmlElement and canUseDom reflect fake dom environment", () => {
    const cleanup = installFakeDom();
    const { document } = cleanup;
    try {
        const div = document.createElement("div");
        assert.equal(isHtmlElement(div), true);
        assert.equal(isHtmlElement({}), false);
        assert.equal(canUseDom(), true);
    } finally {
        cleanup();
    }
});

test("dom utils: getHeaderHeight reads header rect height and falls back to zero", () => {
    const cleanup = installFakeDom();
    const { document } = cleanup;
    try {
        assert.equal(getHeaderHeight(), 0);

        const header = document.createElement("div");
        header.className = "header";
        header._rect = { top: 0, bottom: 72, left: 0, right: 100, width: 100, height: 72 };
        document.body.appendChild(header);

        assert.equal(getHeaderHeight(), 72);
    } finally {
        cleanup();
    }
});

test("dom utils: getViewportHeight prefers window height and falls back to document element", () => {
    const cleanup = installFakeDom();
    const { document, window } = cleanup;
    try {
        assert.equal(getViewportHeight(), 720);

        window.innerHeight = undefined;
        document.documentElement._clientHeight = 640;

        assert.equal(getViewportHeight(), 640);
    } finally {
        cleanup();
    }
});

test("dom utils: isIOSWebKit requires touch support and a WebKit-only CSS property", () => {
    const cleanup = installFakeDom();
    try {
        assert.equal(isIOSWebKit(), false);

        setGlobalValue("navigator", { maxTouchPoints: 5 });
        assert.equal(isIOSWebKit(), false, "touch alone is not iOS WebKit");

        setGlobalValue("CSS", { supports: (property: string) => property === "-webkit-touch-callout" });
        assert.equal(isIOSWebKit(), true);

        setGlobalValue("navigator", { maxTouchPoints: 0 });
        assert.equal(isIOSWebKit(), false, "WebKit CSS without touch is not iOS WebKit");
    } finally {
        cleanup();
    }
});
