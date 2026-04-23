import test from "node:test";
import assert from "node:assert/strict";
import { createBookmarkUiController } from "../app/ui/bookmark/ui.mjs";
import { installFakeDom, invokeListener } from "./test-helpers.mjs";

/**
 * ブックマーク UI テスト用の最小状態を作る。
 * @returns {*}
 */
function createBookmarkUiState() {
    const sidebar = document.createElement("aside");
    const sidebarHeader = document.createElement("div");
    const sidebarScrollArea = document.createElement("div");
    const openBookmarkPanelBtn = document.createElement("button");
    const bookmarkSidebarPanel = document.createElement("section");
    const closeBookmarkPanelBtn = document.createElement("button");
    const bookmarkPanelCreate = document.createElement("div");
    const bookmarkPanelNewName = document.createElement("input");
    const bookmarkPanelError = document.createElement("div");
    const bookmarkPanelCreateBtn = document.createElement("button");
    const bookmarkList = document.createElement("div");

    openBookmarkPanelBtn.setAttribute("id", "open-bookmark-panel");
    bookmarkSidebarPanel.hidden = true;
    bookmarkPanelError.hidden = true;

    sidebar.append(
        sidebarHeader,
        sidebarScrollArea,
        openBookmarkPanelBtn,
        bookmarkSidebarPanel
    );
    bookmarkSidebarPanel.append(
        closeBookmarkPanelBtn,
        bookmarkPanelCreate
    );
    bookmarkPanelCreate.append(
        bookmarkPanelNewName,
        bookmarkPanelError,
        bookmarkPanelCreateBtn
    );
    bookmarkSidebarPanel.append(bookmarkList);
    document.body.appendChild(sidebar);

    return {
        el: {
            sidebar,
            sidebarHeader,
            sidebarScrollArea,
            openBookmarkPanelBtn,
            bookmarkSidebarPanel,
            closeBookmarkPanelBtn,
            bookmarkPanelCreate,
            bookmarkPanelNewName,
            bookmarkPanelError,
            bookmarkPanelCreateBtn,
            bookmarkList
        },
        bookmarkPanel: {
            pendingAction: null,
            exitClosesSidebar: false,
            returnFocusEl: null
        }
    };
}

/**
 * 指定 ID のブックマーク項目要素を返す。
 * @param {*} ui
 * @param {string} bookmarkId
 * @returns {*}
 */
function findBookmarkItem(ui, bookmarkId) {
    return ui.el.bookmarkList.children.find((child) => child.dataset.bookmarkId === bookmarkId) || null;
}

/**
 * ブックマーク UI テスト用のコントローラーとスパイを作る。
 * @param {*} input
 * @returns {*}
 */
function createBookmarkHarness(input) {
    const options = input || {};
    const data = {
        bookmarks: options.bookmarks || {
            "bookmark-1": { name: "First", createdAt: 10, songs: ["song-a"] },
            "bookmark-2": { name: "Second", createdAt: 20, songs: ["song-b", "song-c"] }
        },
        activeBookmark: options.activeBookmark ?? null
    };
    const ui = createBookmarkUiState();
    const calls = {
        clearSearchDebounce: 0,
        scheduleSearchArgs: [],
        addSongArgs: [],
        createBookmarkArgs: [],
        createBookmarkAndAddArgs: [],
        deleteBookmarkArgs: [],
        renameBookmarkArgs: [],
        removeSongArgs: [],
        requestCloseSidebar: 0
    };
    const callbacks = {
        clearSearchDebounce() {
            calls.clearSearchDebounce += 1;
        },
        scheduleSearch(optionsArg) {
            calls.scheduleSearchArgs.push(optionsArg);
        },
        onAddSongToBookmark(bookmarkId, songKey) {
            calls.addSongArgs.push([bookmarkId, songKey]);
            return options.onAddSongToBookmarkResult || { ok: true };
        },
        onCreateBookmark(name) {
            calls.createBookmarkArgs.push(name);
            if (typeof options.onCreateBookmark === "function") {
                return options.onCreateBookmark(name, data);
            }
            data.bookmarks["bookmark-new"] = {
                name,
                createdAt: 30,
                songs: []
            };
            return { ok: true };
        },
        onCreateBookmarkAndAdd(name, songKey) {
            calls.createBookmarkAndAddArgs.push([name, songKey]);
            if (typeof options.onCreateBookmarkAndAdd === "function") {
                return options.onCreateBookmarkAndAdd(name, songKey, data);
            }
            return { ok: true };
        },
        onDeleteBookmark(bookmarkId) {
            calls.deleteBookmarkArgs.push(bookmarkId);
        },
        onRenameBookmark(bookmarkId, name) {
            calls.renameBookmarkArgs.push([bookmarkId, name]);
            return options.onRenameBookmarkResult || { ok: true };
        },
        onRemoveSongFromBookmark(bookmarkId, songKey) {
            calls.removeSongArgs.push([bookmarkId, songKey]);
        },
        onRequestCloseSidebar() {
            calls.requestCloseSidebar += 1;
        }
    };

    return {
        data,
        ui,
        calls,
        controller: createBookmarkUiController({ data, ui, callbacks })
    };
}

test("bookmark ui: add mode success adds to existing bookmark and closes the panel", () => {
    const restoreDom = installFakeDom();
    const previousAlert = globalThis.alert;
    globalThis.alert = () => {};
    try {
        const { ui, calls, controller } = createBookmarkHarness();

        controller.openBookmarkModal("song-z", {
            returnFocusEl: ui.el.openBookmarkPanelBtn
        });

        const firstItem = findBookmarkItem(ui, "bookmark-1");
        assert.ok(firstItem);
        invokeListener(firstItem, "click", {
            target: firstItem,
            stopPropagation() {}
        });

        assert.deepEqual(calls.addSongArgs, [["bookmark-1", "song-z"]]);
        assert.equal(ui.el.bookmarkSidebarPanel.hidden, true);
        assert.equal(ui.el.sidebarHeader.hasAttribute("inert"), false);
        assert.equal(ui.el.sidebarScrollArea.hasAttribute("inert"), false);
    } finally {
        globalThis.alert = previousAlert;
        restoreDom();
    }
});

test("bookmark ui: duplicate add shows alert and keeps the selection panel open", () => {
    const restoreDom = installFakeDom();
    const previousAlert = globalThis.alert;
    const alerts = [];
    globalThis.alert = (message) => {
        alerts.push(String(message));
    };
    try {
        const { ui, calls, controller } = createBookmarkHarness({
            onAddSongToBookmarkResult: { ok: false, reason: "duplicate_song" }
        });

        controller.openBookmarkModal("song-z", {});
        const secondItem = findBookmarkItem(ui, "bookmark-2");
        assert.ok(secondItem);
        invokeListener(secondItem, "click", {
            target: secondItem,
            stopPropagation() {}
        });

        assert.deepEqual(calls.addSongArgs, [["bookmark-2", "song-z"]]);
        assert.equal(ui.el.bookmarkSidebarPanel.hidden, false);
        assert.deepEqual(alerts, ["この曲はすでに選択したブックマークに追加されています。"]);
    } finally {
        globalThis.alert = previousAlert;
        restoreDom();
    }
});

test("bookmark ui: create form shows inline error, clears it on input, and creates on Enter", () => {
    const restoreDom = installFakeDom();
    try {
        const { data, ui, calls, controller } = createBookmarkHarness();
        controller.setupBookmarkHandlers();

        ui.el.bookmarkPanelNewName.value = "   ";
        invokeListener(ui.el.bookmarkPanelCreateBtn, "click", {});
        assert.equal(ui.el.bookmarkPanelError.hidden, false);
        assert.equal(ui.el.bookmarkPanelError.textContent, "ブックマーク名を入力してください。");
        assert.equal(document.activeElement, ui.el.bookmarkPanelNewName);

        ui.el.bookmarkPanelNewName.value = "Focus Songs";
        invokeListener(ui.el.bookmarkPanelNewName, "input", {});
        assert.equal(ui.el.bookmarkPanelError.hidden, true);

        let prevented = false;
        invokeListener(ui.el.bookmarkPanelNewName, "keydown", {
            key: "Enter",
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(prevented, true);
        assert.deepEqual(calls.createBookmarkArgs, ["Focus Songs"]);
        assert.equal(ui.el.bookmarkPanelNewName.value, "");
        assert.equal(document.activeElement, ui.el.bookmarkPanelNewName);
        assert.ok(data.bookmarks["bookmark-new"]);
        assert.equal(findBookmarkItem(ui, "bookmark-new").querySelector(".bookmark-item-name").textContent, "Focus Songs");
    } finally {
        restoreDom();
    }
});

test("bookmark ui: closing with restoreFocus returns focus to opener, or closes sidebar when requested", () => {
    const restoreDom = installFakeDom();
    try {
        const firstHarness = createBookmarkHarness();
        firstHarness.controller.openBookmarkBrowser({
            returnFocusEl: firstHarness.ui.el.openBookmarkPanelBtn
        });
        firstHarness.controller.closeBookmarkModal({ restoreFocus: true });

        assert.equal(firstHarness.ui.el.bookmarkSidebarPanel.hidden, true);
        assert.equal(document.activeElement, firstHarness.ui.el.openBookmarkPanelBtn);

        const secondHarness = createBookmarkHarness();
        secondHarness.controller.openBookmarkModal("song-z", {
            returnFocusEl: secondHarness.ui.el.openBookmarkPanelBtn,
            closeSidebarOnExit: true
        });
        secondHarness.controller.closeBookmarkModal({ restoreFocus: true });

        assert.equal(secondHarness.calls.requestCloseSidebar, 1);
        assert.notEqual(document.activeElement, secondHarness.ui.el.openBookmarkPanelBtn);
    } finally {
        restoreDom();
    }
});

test("bookmark ui: rename cancel and delete cancel are no-ops", () => {
    const restoreDom = installFakeDom();
    const previousPrompt = globalThis.prompt;
    const previousConfirm = globalThis.confirm;
    globalThis.prompt = () => null;
    globalThis.confirm = () => false;
    try {
        const { ui, calls, controller } = createBookmarkHarness();
        controller.renderBookmarks();

        const firstItem = findBookmarkItem(ui, "bookmark-1");
        const renameButton = firstItem.querySelector(".bookmark-rename-btn");
        const deleteButton = firstItem.querySelector(".bookmark-delete-btn");

        invokeListener(firstItem, "click", {
            target: renameButton,
            stopPropagation() {}
        });
        invokeListener(firstItem, "click", {
            target: deleteButton,
            stopPropagation() {}
        });

        assert.deepEqual(calls.renameBookmarkArgs, []);
        assert.deepEqual(calls.deleteBookmarkArgs, []);
    } finally {
        globalThis.prompt = previousPrompt;
        globalThis.confirm = previousConfirm;
        restoreDom();
    }
});
