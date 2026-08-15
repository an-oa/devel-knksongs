import test from "node:test";
import assert from "node:assert/strict";
import { createAutoHideHeaderController } from "../_build/app/ui/header/auto-hide.mjs";
import { installFakeDom, invokeListener } from "./test-helpers.mjs";

/**
 * テスト用ヘッダーと controller を初期化する。
 * @param {number} [initialScrollY]
 * @returns {{ controller: ReturnType<typeof createAutoHideHeaderController>, header: HTMLElement }}
 */
function setupHeaderController(initialScrollY = 0) {
    const header = document.createElement("header");
    header.className = "header";
    header._rect = { top: 0, bottom: 60, left: 0, right: 300, width: 300, height: 60 };
    document.body.appendChild(header);
    window.scrollY = initialScrollY;
    const controller = createAutoHideHeaderController({
        ui: { el: { header } },
        scrollDeltaPx: 16
    });
    controller.setup();
    return { controller, header };
}

/**
 * ページスクロール位置を更新して登録済み listener を呼ぶ。
 * @param {number} scrollY
 */
function scrollPageTo(scrollY) {
    window.scrollY = scrollY;
    const listener = window._events.get("scroll");
    assert.equal(typeof listener, "function");
    listener();
}

test("auto-hide header: starts visible at a restored scroll position", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController(300);

        assert.equal(header.classList.contains("is-auto-hidden"), false);
        scrollPageTo(315);
        assert.equal(header.classList.contains("is-auto-hidden"), false);
        scrollPageTo(316);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: pageshow reveals a header after late scroll restoration", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();

        scrollPageTo(100);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        window.scrollY = 300;
        const pageShowListener = window._events.get("pageshow");
        assert.equal(typeof pageShowListener, "function");
        pageShowListener();
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(315);
        assert.equal(header.classList.contains("is-auto-hidden"), false);
        scrollPageTo(316);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: hides after downward movement and returns after upward movement", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();

        scrollPageTo(60);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(75);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(76);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        scrollPageTo(61);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        scrollPageTo(60);
        assert.equal(header.classList.contains("is-auto-hidden"), false);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: direction changes reset the movement threshold", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();

        scrollPageTo(70);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        scrollPageTo(62);
        scrollPageTo(68);
        scrollPageTo(61);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        scrollPageTo(52);
        assert.equal(header.classList.contains("is-auto-hidden"), false);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: sidebar state keeps the header visible until the next downward movement", () => {
    const restoreDom = installFakeDom();
    try {
        const { controller, header } = setupHeaderController();

        scrollPageTo(100);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        controller.setSidebarOpen(true);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(140);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        controller.setSidebarOpen(false);
        scrollPageTo(155);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(156);
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
        header.appendChild(button);

        scrollPageTo(100);
        assert.equal(header.classList.contains("is-auto-hidden"), true);

        button.focus();
        invokeListener(header, "focusin", { target: button });
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(140);
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        invokeListener(header, "focusout", { relatedTarget: document.body });
        scrollPageTo(156);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});

test("auto-hide header: pointer focus shows without preventing the next hide", () => {
    const restoreDom = installFakeDom();
    try {
        const { header } = setupHeaderController();
        const button = document.createElement("button");
        header.appendChild(button);

        scrollPageTo(100);
        document._events.get("pointerdown")();
        button.focus();
        invokeListener(header, "focusin", { target: button });
        assert.equal(header.classList.contains("is-auto-hidden"), false);

        scrollPageTo(116);
        assert.equal(header.classList.contains("is-auto-hidden"), true);
    } finally {
        restoreDom();
    }
});
