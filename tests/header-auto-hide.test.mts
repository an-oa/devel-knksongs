import test from "node:test";
import assert from "node:assert/strict";
import { createAutoHideHeaderController } from "../app/ui/header/auto-hide.mts";
import { installFakeDom, invokeListener, getFakeElement, installFakeAnimationFrames } from "./test-helpers.mts";

/**
 * テスト用ヘッダーと controller を初期化する。
 * @param {number} [initialScrollY]
 */
function setupHeaderController(initialScrollY = 0) {
    const header = document.createElement("header");
    header.className = "header";
    getFakeElement(header)._rect = { top: 0, bottom: 60, left: 0, right: 300, width: 300, height: 60 };
    document.body.appendChild(header);
    const sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    document.body.appendChild(sidebar);
    window.scrollY = initialScrollY;
    const controller = createAutoHideHeaderController({
        ui: { el: { header } },
        isSidebarOpen: () => sidebar.classList.contains("active"),
        scrollDeltaPx: 16
    });
    controller.setup();
    return {
        controller,
        header,
        setSidebarOpen(open: boolean) {
            sidebar.classList.toggle("active", open);
            controller.handleSidebarOpenChange();
        }
    };
}

/**
 * ページスクロール位置を更新して登録済み listener を呼ぶ。
 * @param {number} scrollY
 */
function scrollPageTo(mockWindow: ReturnType<typeof installFakeDom>["window"], scrollY: number) {
    window.scrollY = scrollY;
    invokeListener(mockWindow, "scroll", {});
}

test("auto-hide header: starts visible at a restored scroll position", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController(300);

        assert.equal(header.classList.contains("is-auto-hidden"), false);
        scrollPageTo(restoreDom.window, 315);
        assert.equal(header.classList.contains("is-auto-hidden"), false);
        scrollPageTo(restoreDom.window, 316);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: pageshow reveals a header after late scroll restoration", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();

        scrollPageTo(restoreDom.window, 100);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        window.scrollY = 300;
        invokeListener(restoreDom.window, "pageshow", {});
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(restoreDom.window, 315);
        assert.equal(header.classList.contains("is-auto-hidden"), false);
        scrollPageTo(restoreDom.window, 316);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: hides after downward movement and returns after upward movement", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();

        scrollPageTo(restoreDom.window, 60);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(restoreDom.window, 75);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(restoreDom.window, 76);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        scrollPageTo(restoreDom.window, 61);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        scrollPageTo(restoreDom.window, 60);
        assert.equal(header.classList.contains("is-auto-hidden"), false);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: direction changes reset the movement threshold", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();

        scrollPageTo(restoreDom.window, 70);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        scrollPageTo(restoreDom.window, 62);
        scrollPageTo(restoreDom.window, 68);
        scrollPageTo(restoreDom.window, 61);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        scrollPageTo(restoreDom.window, 52);
        assert.equal(header.classList.contains("is-auto-hidden"), false);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: sidebar state keeps the header visible until the next downward movement", () => {
    const restoreDom = installFakeDom();
    try {
        const { header, setSidebarOpen } = setupHeaderController();

        scrollPageTo(restoreDom.window, 100);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        setSidebarOpen(true);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(restoreDom.window, 140);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        setSidebarOpen(false);
        scrollPageTo(restoreDom.window, 155);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(restoreDom.window, 156);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: keyboard focus shows and protects the header", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();
        const button = document.createElement("button");
        getFakeElement(button).matches = (selector) => selector === ":focus-visible";
        header.appendChild(button);

        scrollPageTo(restoreDom.window, 100);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        button.focus();
        invokeListener(header, "focusin", { target: button });
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(restoreDom.window, 140);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        button.blur();
        invokeListener(header, "focusout", { relatedTarget: document.body });
        scrollPageTo(restoreDom.window, 156);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: focus without focus-visible shows without preventing the next hide", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();
        const button = document.createElement("button");
        getFakeElement(button).matches = () => false;
        header.appendChild(button);

        scrollPageTo(restoreDom.window, 100);
        button.focus();
        invokeListener(header, "focusin", { target: button });
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(restoreDom.window, 116);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: coalesces scroll events into one animation frame", () => {
    const restoreDom = installFakeDom();
    const frames = installFakeAnimationFrames();
    try {
        const { header } = setupHeaderController();

        scrollPageTo(restoreDom.window, 70);
        scrollPageTo(restoreDom.window, 85);
        scrollPageTo(restoreDom.window, 100);

        assert.equal(frames.pendingCount, 1);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        frames.advanceFrame();
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        frames.cleanup();
        restoreDom();
    }
});
