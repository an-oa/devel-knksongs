import test from "node:test";
import assert from "node:assert/strict";
import {
    canUseDom,
    getHeaderHeight,
    isHtmlElement
} from "../app/lib/dom-utils.mjs";
import { installFakeDom } from "./test-helpers.mjs";

test("dom utils: isHtmlElement and canUseDom reflect fake dom environment", () => {
    const cleanup = installFakeDom();
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
