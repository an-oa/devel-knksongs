import test from "node:test";
import assert from "node:assert/strict";
import { createSidebarController } from "../app/ui/sidebar/ui.mjs";
import { installFakeDom, invokeListener } from "./test-helpers.mjs";

/**
 * サイドバーUIテスト用の最小状態を作る。
 * @returns {*}
 */
function createSidebarUiState() {
    const sidebar = document.createElement("aside");
    sidebar.setAttribute("id", "sidebar");
    const sidebarHeader = document.createElement("div");
    sidebarHeader.className = "sidebar-header";
    const sidebarScrollArea = document.createElement("div");
    sidebarScrollArea.className = "sidebar-scroll-area";
    const settingsSidebarPanel = document.createElement("div");
    const bookmarkSidebarPanel = document.createElement("div");
    const openSidebarBtn = document.createElement("button");
    const closeSidebarBtn = document.createElement("button");
    const overlay = document.createElement("div");
    const loadMoreBtn = document.createElement("button");
    const clearBtn = document.createElement("button");
    const openSettingsPanelBtn = document.createElement("button");
    const closeSettingsPanelBtn = document.createElement("button");
    const closeSettingsSidebarBtn = document.createElement("button");
    const openBookmarkPanelBtn = document.createElement("button");
    const closeBookmarkPanelBtn = document.createElement("button");
    const closeBookmarkSidebarBtn = document.createElement("button");
    const searchBox = document.createElement("input");
    const relayOnly = document.createElement("input");
    const harmonyOnly = document.createElement("input");
    const dateFromYear = document.createElement("select");
    const dateFromMonth = document.createElement("select");
    const dateFromDay = document.createElement("select");
    const dateToYear = document.createElement("select");
    const dateToMonth = document.createElement("select");
    const dateToDay = document.createElement("select");
    const clearDateFromBtn = document.createElement("button");
    const clearDateToBtn = document.createElement("button");

    openSidebarBtn.setAttribute("id", "open-sidebar");
    closeSidebarBtn.setAttribute("id", "close-sidebar");
    overlay.setAttribute("id", "sidebar-overlay");
    loadMoreBtn.setAttribute("id", "loadMoreBtn");
    clearBtn.setAttribute("id", "clearBtn");

    settingsSidebarPanel.hidden = true;
    bookmarkSidebarPanel.hidden = true;

    sidebar.appendChild(sidebarHeader);
    sidebar.appendChild(sidebarScrollArea);
    sidebar.appendChild(settingsSidebarPanel);
    sidebar.appendChild(bookmarkSidebarPanel);
    document.body.append(
        sidebar,
        openSidebarBtn,
        closeSidebarBtn,
        overlay,
        loadMoreBtn,
        clearBtn
    );

    sidebar.querySelectorAll = () => [
        closeSidebarBtn,
        clearBtn,
        openSettingsPanelBtn,
        openBookmarkPanelBtn,
        closeSettingsPanelBtn,
        closeSettingsSidebarBtn,
        closeBookmarkPanelBtn,
        closeBookmarkSidebarBtn,
        searchBox,
        relayOnly,
        harmonyOnly,
        dateFromYear,
        dateFromMonth,
        dateFromDay,
        dateToYear,
        dateToMonth,
        dateToDay,
        clearDateFromBtn,
        clearDateToBtn
    ].filter((element) => !element.hidden && !element.hasAttribute("inert"));

    return {
        ui: {
            el: {
                sidebar,
                sidebarHeader,
                sidebarScrollArea,
                settingsSidebarPanel,
                bookmarkSidebarPanel,
                openSettingsPanelBtn,
                closeSettingsPanelBtn,
                closeSettingsSidebarBtn,
                openBookmarkPanelBtn,
                closeBookmarkPanelBtn,
                closeBookmarkSidebarBtn,
                searchBox,
                relayOnly,
                harmonyOnly,
                dateFromYear,
                dateFromMonth,
                dateFromDay,
                dateToYear,
                dateToMonth,
                dateToDay,
                clearDateFromBtn,
                clearDateToBtn
            },
            settingsPanel: {
                returnFocusEl: null
            }
        },
        openSidebarBtn,
        closeSidebarBtn,
        overlay,
        loadMoreBtn,
        clearBtn
    };
}

/**
 * サイドバーコントローラー用のコールバックを作る。
 * @param {*} input
 * @returns {*}
 */
function createSidebarCallbacks(input) {
    const state = input || {};
    const bookmarkUiController = state.bookmarkUiController || {
        closeBookmarkModal() {},
        openBookmarkBrowser() {},
        setupBookmarkHandlers() {},
        openBookmarkModal() {},
        removeSongFromActiveBookmark() {},
        clearActiveBookmark() {}
    };
    return {
        getBookmarkUiController: () => bookmarkUiController,
        isIOSWebKit: () => false,
        markFilterTouched: () => {},
        markQueryTouched: () => {},
        clampDateInputsIfNeeded: () => {},
        syncDateSelectOptions: () => {},
        resetDateSelectGroup: () => {},
        updateDisplay: () => {},
        clearSearch: () => {}
    };
}

test("sidebar: opening settings panel makes background inert and focuses back button", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, openSidebarBtn } = createSidebarUiState();
        let closedBookmarkModal = 0;
        const controller = createSidebarController({
            data: { displayLimit: 48 },
            ui,
            constants: { resultDisplayBatchSize: 48 },
            callbacks: createSidebarCallbacks({
                bookmarkUiController: {
                    closeBookmarkModal() {
                        closedBookmarkModal += 1;
                    },
                    openBookmarkBrowser() {},
                    setupBookmarkHandlers() {},
                    openBookmarkModal() {},
                    removeSongFromActiveBookmark() {},
                    clearActiveBookmark() {}
                }
            })
        });

        controller.setupUIHandlers();
        invokeListener(openSidebarBtn, "click", {});
        invokeListener(ui.el.openSettingsPanelBtn, "click", {});

        assert.equal(ui.el.settingsSidebarPanel.hidden, false);
        assert.equal(ui.el.settingsSidebarPanel.getAttribute("aria-hidden"), "false");
        assert.equal(ui.el.sidebarHeader.hasAttribute("inert"), true);
        assert.equal(ui.el.sidebarScrollArea.hasAttribute("inert"), true);
        assert.equal(document.activeElement, ui.el.closeSettingsPanelBtn);
        assert.equal(closedBookmarkModal, 2);
    } finally {
        restoreDom();
    }
});

test("sidebar: escape closes settings panel, removes inert, and restores focus", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, openSidebarBtn } = createSidebarUiState();
        const controller = createSidebarController({
            data: { displayLimit: 48 },
            ui,
            constants: { resultDisplayBatchSize: 48 },
            callbacks: createSidebarCallbacks()
        });

        controller.setupUIHandlers();
        invokeListener(openSidebarBtn, "click", {});
        invokeListener(ui.el.openSettingsPanelBtn, "click", {});

        const keydownListener = document._events.get("keydown");
        assert.equal(typeof keydownListener, "function");
        let prevented = false;
        keydownListener({
            key: "Escape",
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(prevented, true);
        assert.equal(ui.el.settingsSidebarPanel.hidden, true);
        assert.equal(ui.el.settingsSidebarPanel.getAttribute("aria-hidden"), "true");
        assert.equal(ui.el.sidebarHeader.hasAttribute("inert"), false);
        assert.equal(ui.el.sidebarScrollArea.hasAttribute("inert"), false);
        assert.equal(document.activeElement, ui.el.openSettingsPanelBtn);
    } finally {
        restoreDom();
    }
});

test("sidebar: openBookmarkModal opens sidebar first when closed and passes closeSidebarOnExit", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, closeSidebarBtn } = createSidebarUiState();
        const launcher = document.createElement("button");
        document.body.appendChild(launcher);
        launcher.focus();
        const openBookmarkCalls = [];
        const controller = createSidebarController({
            data: { displayLimit: 48 },
            ui,
            constants: { resultDisplayBatchSize: 48 },
            callbacks: createSidebarCallbacks({
                bookmarkUiController: {
                    closeBookmarkModal() {},
                    openBookmarkBrowser() {},
                    setupBookmarkHandlers() {},
                    openBookmarkModal(songKey, options) {
                        openBookmarkCalls.push({ songKey, options });
                    },
                    removeSongFromActiveBookmark() {},
                    clearActiveBookmark() {}
                }
            })
        });

        controller.setupUIHandlers();
        controller.openBookmarkModal("song-42");

        assert.equal(ui.el.sidebar.classList.contains("active"), true);
        assert.equal(openBookmarkCalls.length, 1);
        assert.equal(openBookmarkCalls[0].songKey, "song-42");
        assert.equal(openBookmarkCalls[0].options.returnFocusEl, launcher);
        assert.equal(openBookmarkCalls[0].options.closeSidebarOnExit, true);
        assert.equal(document.activeElement, closeSidebarBtn);
    } finally {
        restoreDom();
    }
});

test("sidebar: escape prioritizes settings panel over bookmark panel", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, openSidebarBtn } = createSidebarUiState();
        let bookmarkCloseCount = 0;
        const controller = createSidebarController({
            data: { displayLimit: 48 },
            ui,
            constants: { resultDisplayBatchSize: 48 },
            callbacks: createSidebarCallbacks({
                bookmarkUiController: {
                    closeBookmarkModal() {
                        bookmarkCloseCount += 1;
                    },
                    openBookmarkBrowser() {},
                    setupBookmarkHandlers() {},
                    openBookmarkModal() {},
                    removeSongFromActiveBookmark() {},
                    clearActiveBookmark() {}
                }
            })
        });

        controller.setupUIHandlers();
        invokeListener(openSidebarBtn, "click", {});
        ui.el.settingsSidebarPanel.hidden = false;
        ui.el.bookmarkSidebarPanel.hidden = false;
        ui.el.openSettingsPanelBtn.focus();

        const keydownListener = document._events.get("keydown");
        let prevented = false;
        keydownListener({
            key: "Escape",
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(prevented, true);
        assert.equal(ui.el.settingsSidebarPanel.hidden, true);
        assert.equal(ui.el.bookmarkSidebarPanel.hidden, false);
        assert.equal(bookmarkCloseCount, 1);
        assert.equal(document.activeElement, ui.el.openSettingsPanelBtn);
    } finally {
        restoreDom();
    }
});

test("sidebar: ios year change clears lower date selects and removes updating class after two frames", () => {
    const restoreDom = installFakeDom();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const frameQueue = [];
    globalThis.requestAnimationFrame = (callback) => {
        frameQueue.push(callback);
        return frameQueue.length;
    };
    try {
        const { ui } = createSidebarUiState();
        const fromGroup = document.createElement("div");
        fromGroup.className = "date-select-group";
        fromGroup.append(ui.el.dateFromYear, ui.el.dateFromMonth, ui.el.dateFromDay);
        ui.el.sidebar.appendChild(fromGroup);
        ui.el.dateFromYear.value = "2026";
        ui.el.dateFromMonth.value = "03";
        ui.el.dateFromDay.value = "11";
        const markFilterTouchedArgs = [];
        let clampCount = 0;
        let syncCount = 0;
        const controller = createSidebarController({
            data: { displayLimit: 48 },
            ui,
            constants: { resultDisplayBatchSize: 48 },
            callbacks: {
                ...createSidebarCallbacks(),
                isIOSWebKit: () => true,
                markFilterTouched: (options) => {
                    markFilterTouchedArgs.push(options);
                },
                clampDateInputsIfNeeded: () => {
                    clampCount += 1;
                },
                syncDateSelectOptions: () => {
                    syncCount += 1;
                }
            }
        });

        controller.setupUIHandlers();
        invokeListener(ui.el.dateFromYear, "change", { target: ui.el.dateFromYear });

        assert.equal(fromGroup.classList.contains("is-updating"), true);
        assert.equal(ui.el.dateFromMonth.value, "");
        assert.equal(ui.el.dateFromDay.value, "");
        assert.deepEqual(markFilterTouchedArgs, [{ immediate: true }]);
        assert.equal(clampCount, 1);
        assert.equal(syncCount, 1);

        frameQueue.shift()();
        assert.equal(fromGroup.classList.contains("is-updating"), true);
        frameQueue.shift()();
        assert.equal(fromGroup.classList.contains("is-updating"), false);
    } finally {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
        restoreDom();
    }
});

test("sidebar: tab focus is trapped within the active sidebar in both directions", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, openSidebarBtn, closeSidebarBtn } = createSidebarUiState();
        const controller = createSidebarController({
            data: { displayLimit: 48 },
            ui,
            constants: { resultDisplayBatchSize: 48 },
            callbacks: createSidebarCallbacks()
        });

        controller.setupUIHandlers();
        invokeListener(openSidebarBtn, "click", {});

        const keydownListener = document._events.get("keydown");
        let preventedForward = false;
        ui.el.clearDateToBtn.focus();
        keydownListener({
            key: "Tab",
            shiftKey: false,
            preventDefault() {
                preventedForward = true;
            }
        });

        assert.equal(preventedForward, true);
        assert.equal(document.activeElement, closeSidebarBtn);

        let preventedBackward = false;
        closeSidebarBtn.focus();
        keydownListener({
            key: "Tab",
            shiftKey: true,
            preventDefault() {
                preventedBackward = true;
            }
        });

        assert.equal(preventedBackward, true);
        assert.equal(document.activeElement, ui.el.clearDateToBtn);
    } finally {
        restoreDom();
    }
});
