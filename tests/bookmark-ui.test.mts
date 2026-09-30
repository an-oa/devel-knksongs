import type { StorageActionResult } from "../app/controllers/storage.mts";
import test from "node:test";
import assert from "node:assert/strict";
import { createBookmarkUiController } from "../app/ui/bookmark/ui.mts";
import { createSongFixture } from "./fixtures/song.mts";
import type { BookmarkUiCallbacks } from "../app/ui/bookmark/ui.mts";
import { installFakeDom, invokeListener } from "./test-helpers.mts";

/**
 * ブックマーク UI テスト用の最小状態を作る。
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
    const bookmarkPanelExportBtn = document.createElement("button");
    const bookmarkPanelImportBtn = document.createElement("button");
    const bookmarkPanelImportInput = document.createElement("input");
    const bookmarkList = document.createElement("div");
    const bookmarkNotificationRegion = document.createElement("div");

    openBookmarkPanelBtn.setAttribute("id", "open-bookmark-panel");
    bookmarkSidebarPanel.hidden = true;
    bookmarkPanelError.hidden = true;
    bookmarkPanelImportInput.type = "file";

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
    bookmarkSidebarPanel.append(
        bookmarkPanelExportBtn,
        bookmarkPanelImportBtn,
        bookmarkPanelImportInput
    );
    bookmarkSidebarPanel.append(bookmarkList);
    document.body.appendChild(bookmarkNotificationRegion);
    document.body.appendChild(sidebar);

    const bookmarkPanel: Parameters<typeof createBookmarkUiController>[0]["ui"]["bookmarkPanel"] = {
        pendingAction: null,
        exitClosesSidebar: false,
        returnFocusEl: null
    };
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
            bookmarkPanelExportBtn,
            bookmarkPanelImportBtn,
            bookmarkPanelImportInput,
            bookmarkList,
            bookmarkNotificationRegion
        },
        lookup: {
            songMapByBookmarkKey: new Map<string, Song>(),
            songMapByKey: new Map<string, Song>(),
            songLookupSourceRef: null
        },
        bookmarkPanel
    };
}

/**
 * 指定 ID のブックマーク項目要素を返す。
 * @param {string} bookmarkId
 */
function findBookmarkItem(ui: ReturnType<typeof createBookmarkUiState>, bookmarkId: string) {
    const item = Array.from(ui.el.bookmarkList.querySelectorAll<HTMLElement>(".bookmark-item"))
        .find((child) => child.dataset.bookmarkId === bookmarkId);
    assert.ok(item, `bookmark item ${bookmarkId} is missing`);
    return item;
}

/**
 * ブックマーク UI テスト用のコントローラーとスパイを作る。
 */
function createBookmarkHarness(options: {
    allSongsRaw?: Song[];
    bookmarks?: Parameters<typeof createBookmarkUiController>[0]["data"]["bookmarks"];
    activeBookmark?: string | null;
    onCreateBookmark?: (name: string, data: Parameters<typeof createBookmarkUiController>[0]["data"]) => StorageActionResult;
    onCreateBookmarkAndAdd?: (name: string, songKey: string, data: Parameters<typeof createBookmarkUiController>[0]["data"]) => StorageActionResult;
    onAddSongToBookmarkResult?: StorageActionResult;
    onDeleteBookmarkResult?: StorageActionResult;
    onRenameBookmarkResult?: StorageActionResult;
    onRemoveSongFromBookmarkResult?: StorageActionResult;
    onExportBookmarksResult?: ReturnType<BookmarkUiCallbacks["onExportBookmarks"]>;
    onPreviewBookmarkImportResult?: ReturnType<BookmarkUiCallbacks["onPreviewBookmarkImport"]>;
    onImportBookmarksTextResult?: ReturnType<BookmarkUiCallbacks["onImportBookmarksText"]>;
} = {}) {
    const data: Parameters<typeof createBookmarkUiController>[0]["data"] = {
        allSongsRaw: options.allSongsRaw || [
            createSongFixture({
                songKey: "song-z",
                bookmarkSongKey: "song-z",
                title: "透明な朝"
            })
        ],
        bookmarks: options.bookmarks || {
            "bookmark-1": { name: "First", createdAt: 10, songs: ["song-a"] },
            "bookmark-2": { name: "Second", createdAt: 20, songs: ["song-b", "song-c"] }
        },
        activeBookmark: options.activeBookmark ?? null
    };
    const ui = createBookmarkUiState();
    const calls: {
        selectActiveBookmarkArgs: string[];
        clearActiveBookmark: number;
        addSongArgs: [string, string][];
        createBookmarkArgs: string[];
        createBookmarkAndAddArgs: [string, string][];
        deleteBookmarkArgs: string[];
        renameBookmarkArgs: [string, string][];
        removeSongArgs: [string, string][];
        requestCloseSidebar: number;
        exportBookmarkCount: number;
        previewImportArgs: string[];
        importTextArgs: string[];
        savedFiles: { text: string; fileName: string; mimeType: string }[];
    } = {
        selectActiveBookmarkArgs: [],
        clearActiveBookmark: 0,
        addSongArgs: [],
        createBookmarkArgs: [],
        createBookmarkAndAddArgs: [],
        deleteBookmarkArgs: [],
        renameBookmarkArgs: [],
        removeSongArgs: [],
        requestCloseSidebar: 0,
        exportBookmarkCount: 0,
        previewImportArgs: [],
        importTextArgs: [],
        savedFiles: []
    };
    const callbacks: BookmarkUiCallbacks = {
        onSelectActiveBookmark(bookmarkId) {
            calls.selectActiveBookmarkArgs.push(bookmarkId);
            return { ok: true };
        },
        onClearActiveBookmark() {
            calls.clearActiveBookmark += 1;
            return { ok: true };
        },
        onAddSongToBookmark(bookmarkId, songKey) {
            calls.addSongArgs.push([bookmarkId, songKey]);
            return options.onAddSongToBookmarkResult ?? { ok: true };
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
            return options.onDeleteBookmarkResult ?? { ok: true };
        },
        onRenameBookmark(bookmarkId, name) {
            calls.renameBookmarkArgs.push([bookmarkId, name]);
            return options.onRenameBookmarkResult ?? { ok: true };
        },
        onRemoveSongFromBookmark(bookmarkId, songKey) {
            calls.removeSongArgs.push([bookmarkId, songKey]);
            return options.onRemoveSongFromBookmarkResult ?? { ok: true };
        },
        onExportBookmarks() {
            calls.exportBookmarkCount += 1;
            return options.onExportBookmarksResult ?? {
                ok: true,
                text: "{\"version\":3,\"bookmarks\":{}}\n"
            };
        },
        onPreviewBookmarkImport(text) {
            calls.previewImportArgs.push(text);
            return options.onPreviewBookmarkImportResult ?? {
                ok: true,
                bookmarkCount: 1,
                songCount: 2
            };
        },
        onImportBookmarksText(text) {
            calls.importTextArgs.push(text);
            return options.onImportBookmarksTextResult ?? {
                ok: true,
                bookmarkCount: 1,
                songCount: 2
            };
        },
        onRequestCloseSidebar() {
            calls.requestCloseSidebar += 1;
        },
        async saveTextFile(text, fileName, mimeType) {
            calls.savedFiles.push({ text, fileName, mimeType });
        }
    };

    return {
        data,
        ui,
        calls,
        controller: createBookmarkUiController({ data, ui, callbacks })
    };
}

test("bookmark ui: selecting a bookmark delegates the intent to state management", () => {
    const restoreDom = installFakeDom();
    try {
        const { calls, controller } = createBookmarkHarness();

        controller.setActiveBookmark("bookmark-1");

        assert.deepEqual(calls.selectActiveBookmarkArgs, ["bookmark-1"]);
    } finally {
        restoreDom();
    }
});

test("bookmark ui: clearing a bookmark delegates the intent to state management", () => {
    const restoreDom = installFakeDom();
    try {
        const { calls, controller } = createBookmarkHarness({
            activeBookmark: "bookmark-1"
        });

        controller.clearActiveBookmark();

        assert.equal(calls.clearActiveBookmark, 1);
    } finally {
        restoreDom();
    }
});

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

test("bookmark ui: add mode success notifies bookmark name and song title", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, controller } = createBookmarkHarness();

        controller.openBookmarkModal("song-z", {
            returnFocusEl: ui.el.openBookmarkPanelBtn
        });

        const firstItem = findBookmarkItem(ui, "bookmark-1");
        assert.ok(firstItem);
        invokeListener(firstItem, "click", {
            target: firstItem,
            stopPropagation() {}
        });

        const message = ui.el.bookmarkNotificationRegion.querySelector(".bookmark-toast-message");
        assert.ok(message);
        assert.equal(message.textContent, "ブックマーク「First」に「透明な朝」を保存しました。");
    } finally {
        restoreDom();
    }
});

test("bookmark ui: create-and-add closes without leaving focus inside hidden panel", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, calls, controller } = createBookmarkHarness();
        controller.setupBookmarkHandlers();
        controller.openBookmarkModal("song-z", {
            returnFocusEl: ui.el.openBookmarkPanelBtn
        });

        ui.el.bookmarkPanelNewName.value = "Focus Songs";
        ui.el.bookmarkPanelCreateBtn.focus();
        invokeListener(ui.el.bookmarkPanelCreateBtn, "click", {});

        assert.deepEqual(calls.createBookmarkAndAddArgs, [["Focus Songs", "song-z"]]);
        assert.equal(ui.el.bookmarkSidebarPanel.hidden, true);
        assert.equal(ui.el.bookmarkSidebarPanel.getAttribute("aria-hidden"), "true");
        assert.equal(document.activeElement, null);
        assert.equal(ui.el.sidebarHeader.hasAttribute("inert"), false);
        assert.equal(ui.el.sidebarScrollArea.hasAttribute("inert"), false);
    } finally {
        restoreDom();
    }
});

test("bookmark ui: create-and-add notifies created bookmark and saved song title", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, controller } = createBookmarkHarness();
        controller.setupBookmarkHandlers();
        controller.openBookmarkModal("song-z", {
            returnFocusEl: ui.el.openBookmarkPanelBtn
        });

        ui.el.bookmarkPanelNewName.value = "Focus Songs";
        invokeListener(ui.el.bookmarkPanelCreateBtn, "click", {});

        const message = ui.el.bookmarkNotificationRegion.querySelector(".bookmark-toast-message");
        assert.ok(message);
        assert.equal(message.textContent, "ブックマーク「Focus Songs」を作成し、「透明な朝」を保存しました。");
    } finally {
        restoreDom();
    }
});

test("bookmark ui: duplicate add shows alert and keeps the selection panel open", () => {
    const restoreDom = installFakeDom();
    const previousAlert = globalThis.alert;
    const alerts: string[] = [];
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
        const name = findBookmarkItem(ui, "bookmark-new").querySelector(".bookmark-item-name");
        assert.ok(name);
        assert.equal(name.textContent, "Focus Songs");
    } finally {
        restoreDom();
    }
});

test("bookmark ui: create form success notifies created bookmark", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, controller } = createBookmarkHarness();
        controller.setupBookmarkHandlers();

        ui.el.bookmarkPanelNewName.value = "Focus Songs";
        invokeListener(ui.el.bookmarkPanelCreateBtn, "click", {});

        const toast = ui.el.bookmarkNotificationRegion.querySelector(".bookmark-toast");
        assert.ok(toast);
        const message = toast.querySelector(".bookmark-toast-message");
        assert.ok(message);
        const closeBtn = toast.querySelector(".bookmark-toast-close");
        assert.ok(closeBtn);
        assert.equal(message.textContent, "ブックマーク「Focus Songs」を作成しました。");
        assert.equal(closeBtn.getAttribute("aria-label"), "通知を閉じる");
        assert.equal(closeBtn.getAttribute("popovertargetaction"), "hide");
    } finally {
        restoreDom();
    }
});

test("bookmark ui: unsupported storage version shows an error without a success notification", () => {
    const restoreDom = installFakeDom();
    const previousAlert = globalThis.alert;
    const alerts: string[] = [];
    globalThis.alert = (message) => {
        alerts.push(String(message));
    };
    try {
        const { ui, controller } = createBookmarkHarness({
            onCreateBookmark: () => ({
                ok: false,
                reason: "unsupported_storage_version",
                version: 4
            })
        });
        controller.setupBookmarkHandlers();
        ui.el.bookmarkPanelNewName.value = "Not persisted";

        invokeListener(ui.el.bookmarkPanelCreateBtn, "click", {});

        assert.deepEqual(alerts, [
            "このアプリより新しい形式のブックマークが保存されているため、変更できません。"
        ]);
        assert.equal(ui.el.bookmarkPanelNewName.value, "Not persisted");
        assert.equal(ui.el.bookmarkNotificationRegion.childElementCount, 0);
    } finally {
        globalThis.alert = previousAlert;
        restoreDom();
    }
});

test("bookmark ui: stale loaded storage state asks for a reload without a success notification", () => {
    const restoreDom = installFakeDom();
    const previousAlert = globalThis.alert;
    const alerts: string[] = [];
    globalThis.alert = (message) => {
        alerts.push(String(message));
    };
    try {
        const { ui, controller } = createBookmarkHarness({
            onCreateBookmark: () => ({
                ok: false,
                reason: "storage_reload_required"
            })
        });
        controller.setupBookmarkHandlers();
        ui.el.bookmarkPanelNewName.value = "Not persisted";

        invokeListener(ui.el.bookmarkPanelCreateBtn, "click", {});

        assert.deepEqual(alerts, [
            "別のタブでブックマークが更新された可能性があります。画面を再読み込みしてから、もう一度お試しください。"
        ]);
        assert.equal(ui.el.bookmarkPanelNewName.value, "Not persisted");
        assert.equal(ui.el.bookmarkNotificationRegion.childElementCount, 0);
    } finally {
        globalThis.alert = previousAlert;
        restoreDom();
    }
});

test("bookmark ui: public save error notifier asks for a reload", () => {
    const restoreDom = installFakeDom();
    const previousAlert = globalThis.alert;
    const alerts: string[] = [];
    globalThis.alert = (message) => {
        alerts.push(String(message));
    };
    try {
        const { controller } = createBookmarkHarness();

        const didNotify = controller.notifyBookmarkSaveError({
            ok: false,
            reason: "storage_reload_required"
        });

        assert.equal(didNotify, true);
        assert.deepEqual(alerts, [
            "別のタブでブックマークが更新された可能性があります。画面を再読み込みしてから、もう一度お試しください。"
        ]);
    } finally {
        globalThis.alert = previousAlert;
        restoreDom();
    }
});

test("bookmark ui: removing a song from active bookmark notifies bookmark name and song title", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, calls, controller } = createBookmarkHarness({
            activeBookmark: "bookmark-1",
            bookmarks: {
                "bookmark-1": { name: "First", createdAt: 10, songs: ["song-z"] }
            }
        });

        controller.removeSongFromActiveBookmark("song-z");

        const message = ui.el.bookmarkNotificationRegion.querySelector(".bookmark-toast-message");
        assert.ok(message);
        assert.deepEqual(calls.removeSongArgs, [["bookmark-1", "song-z"]]);
        assert.equal(message.textContent, "ブックマーク「First」から「透明な朝」を削除しました。");
    } finally {
        restoreDom();
    }
});

test("bookmark ui: failed song removal does not show a success notification", () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, calls, controller } = createBookmarkHarness({
            activeBookmark: "bookmark-1",
            bookmarks: {
                "bookmark-1": { name: "First", createdAt: 10, songs: ["song-z"] }
            },
            onRemoveSongFromBookmarkResult: { ok: false, reason: "song_not_found" }
        });

        controller.removeSongFromActiveBookmark("song-z");

        assert.deepEqual(calls.removeSongArgs, [["bookmark-1", "song-z"]]);
        assert.equal(ui.el.bookmarkNotificationRegion.childElementCount, 0);
    } finally {
        restoreDom();
    }
});

test("bookmark ui: deleting a bookmark notifies the deleted bookmark name", () => {
    const restoreDom = installFakeDom();
    const previousConfirm = globalThis.confirm;
    globalThis.confirm = () => true;
    try {
        const { ui, calls, controller } = createBookmarkHarness();
        controller.renderBookmarks();

        const firstItem = findBookmarkItem(ui, "bookmark-1");
        const deleteButton = firstItem.querySelector(".bookmark-delete-btn");
        assert.ok(deleteButton);
        invokeListener(firstItem, "click", {
            target: deleteButton,
            stopPropagation() {}
        });

        const message = ui.el.bookmarkNotificationRegion.querySelector(".bookmark-toast-message");
        assert.ok(message);
        assert.deepEqual(calls.deleteBookmarkArgs, ["bookmark-1"]);
        assert.equal(message.textContent, "ブックマーク「First」を削除しました。");
    } finally {
        globalThis.confirm = previousConfirm;
        restoreDom();
    }
});

test("bookmark ui: failed bookmark deletion does not show a success notification", () => {
    const restoreDom = installFakeDom();
    const previousConfirm = globalThis.confirm;
    const previousAlert = globalThis.alert;
    const alerts: string[] = [];
    globalThis.confirm = () => true;
    globalThis.alert = (message) => {
        alerts.push(String(message));
    };
    try {
        const { ui, calls, controller } = createBookmarkHarness({
            onDeleteBookmarkResult: { ok: false, reason: "bookmark_not_found" }
        });
        controller.renderBookmarks();

        const firstItem = findBookmarkItem(ui, "bookmark-1");
        const deleteButton = firstItem.querySelector(".bookmark-delete-btn");
        assert.ok(deleteButton);
        invokeListener(firstItem, "click", {
            target: deleteButton,
            stopPropagation() {}
        });

        assert.deepEqual(calls.deleteBookmarkArgs, ["bookmark-1"]);
        assert.equal(ui.el.bookmarkNotificationRegion.childElementCount, 0);
        assert.deepEqual(alerts, ["ブックマークが見つかりません。画面を更新して再度お試しください。"]);
    } finally {
        globalThis.confirm = previousConfirm;
        globalThis.alert = previousAlert;
        restoreDom();
    }
});

test("bookmark ui: export button saves the JSON payload with a default filename", async () => {
    const restoreDom = installFakeDom();
    try {
        const { ui, calls, controller } = createBookmarkHarness();
        controller.setupBookmarkHandlers();

        await invokeListener(ui.el.bookmarkPanelExportBtn, "click", {});

        assert.equal(calls.exportBookmarkCount, 1);
        assert.equal(calls.savedFiles.length, 1);
        assert.equal(calls.savedFiles[0].text, "{\"version\":3,\"bookmarks\":{}}\n");
        assert.match(calls.savedFiles[0].fileName, /^knksongs-bookmarks-\d{8}\.json$/);
        assert.equal(calls.savedFiles[0].mimeType, "application/json");
        assert.equal(ui.el.bookmarkPanelError.hidden, true);
    } finally {
        restoreDom();
    }
});

test("bookmark ui: import button reads JSON and confirms full replacement", async () => {
    const restoreDom = installFakeDom();
    const previousConfirm = globalThis.confirm;
    const previousAlert = globalThis.alert;
    const confirms: string[] = [];
    const alerts: string[] = [];
    globalThis.confirm = (message) => {
        confirms.push(String(message));
        return true;
    };
    globalThis.alert = (message) => {
        alerts.push(String(message));
    };
    try {
        const { ui, calls, controller } = createBookmarkHarness();
        controller.setupBookmarkHandlers();

        let filePickerOpened = false;
        ui.el.bookmarkPanelImportInput.click = () => {
            filePickerOpened = true;
        };
        invokeListener(ui.el.bookmarkPanelImportBtn, "click", {});
        assert.equal(filePickerOpened, true);

        const importText = "{\"version\":2,\"bookmarks\":{}}";
        Object.defineProperty(ui.el.bookmarkPanelImportInput, "files", {
            value: [new File([importText], "bookmarks.json", { type: "application/json" })],
            configurable: true
        });
        await invokeListener(ui.el.bookmarkPanelImportInput, "change", {});

        assert.deepEqual(calls.previewImportArgs, [importText]);
        assert.deepEqual(calls.importTextArgs, [importText]);
        assert.deepEqual(confirms, [
            [
                "現在のブックマークを置き換えます。",
                "1件のブックマーク、2曲をインポートします。",
                "よろしいですか？"
            ].join("\n")
        ]);
        assert.deepEqual(alerts, ["ブックマークを1件インポートしました。"]);
        assert.equal(ui.el.bookmarkPanelImportInput.value, "");
        assert.equal(ui.el.bookmarkPanelError.hidden, true);
    } finally {
        globalThis.confirm = previousConfirm;
        globalThis.alert = previousAlert;
        restoreDom();
    }
});

test("bookmark ui: import error is shown without replacing bookmarks", async () => {
    const restoreDom = installFakeDom();
    const previousConfirm = globalThis.confirm;
    let confirmCount = 0;
    globalThis.confirm = () => {
        confirmCount += 1;
        return true;
    };
    try {
        const { ui, calls, controller } = createBookmarkHarness({
            onPreviewBookmarkImportResult: { ok: false, reason: "invalid_json" }
        });
        controller.setupBookmarkHandlers();

        const importText = "{";
        Object.defineProperty(ui.el.bookmarkPanelImportInput, "files", {
            value: [new File([importText], "bookmarks.json", { type: "application/json" })],
            configurable: true
        });
        await invokeListener(ui.el.bookmarkPanelImportInput, "change", {});

        assert.deepEqual(calls.previewImportArgs, [importText]);
        assert.deepEqual(calls.importTextArgs, []);
        assert.equal(confirmCount, 0);
        assert.equal(ui.el.bookmarkPanelError.hidden, false);
        assert.equal(ui.el.bookmarkPanelError.textContent, "JSONとして読み込めないファイルです。");
    } finally {
        globalThis.confirm = previousConfirm;
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
        assert.ok(renameButton);
        const deleteButton = firstItem.querySelector(".bookmark-delete-btn");
        assert.ok(deleteButton);

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

for (const { result, saveMessage, importMessage } of [
    {
        result: { ok: false, reason: "storage_write_failed" },
        saveMessage: "ブックマークを保存できませんでした。ブラウザのストレージ設定をご確認ください。",
        importMessage: "インポートしたブックマークを保存できませんでした。"
    },
    {
        result: { ok: false, reason: "storage_reload_required" },
        saveMessage: "別のタブでブックマークが更新された可能性があります。画面を再読み込みしてから、もう一度お試しください。",
        importMessage: "ブックマークファイルを読み込めませんでした。"
    },
    {
        result: { ok: false, reason: "unsupported_storage_version", version: 4 },
        saveMessage: "このアプリより新しい形式のブックマークが保存されているため、変更できません。",
        importMessage: "ブックマークファイルを読み込めませんでした。"
    }
] as const) {
    test(`bookmark ui: ${result.reason} add result keeps the panel open without a success toast`, () => {
        const restoreDom = installFakeDom();
        const previousAlert = globalThis.alert;
        const alerts: string[] = [];
        globalThis.alert = (message) => alerts.push(String(message));
        try {
            const { ui, calls, controller } = createBookmarkHarness({ onAddSongToBookmarkResult: result });
            controller.openBookmarkModal("song-z", {});
            const item = findBookmarkItem(ui, "bookmark-1");
            invokeListener(item, "click", { target: item });

            assert.deepEqual(calls.addSongArgs, [["bookmark-1", "song-z"]]);
            assert.equal(ui.el.bookmarkSidebarPanel.hidden, false);
            assert.equal(ui.el.bookmarkNotificationRegion.childElementCount, 0);
            assert.deepEqual(alerts, [saveMessage]);
        } finally {
            globalThis.alert = previousAlert;
            restoreDom();
        }
    });

    test(`bookmark ui: ${result.reason} export result shows an error without saving a file`, async () => {
        const restoreDom = installFakeDom();
        try {
            const { ui, calls, controller } = createBookmarkHarness({ onExportBookmarksResult: result });
            controller.setupBookmarkHandlers();
            await invokeListener(ui.el.bookmarkPanelExportBtn, "click", {});

            assert.equal(calls.exportBookmarkCount, 1);
            assert.deepEqual(calls.savedFiles, []);
            assert.equal(ui.el.bookmarkPanelError.hidden, false);
            assert.equal(ui.el.bookmarkPanelError.textContent, "ブックマークをエクスポートできませんでした。");
        } finally {
            restoreDom();
        }
    });

    for (const phase of ["preview", "import"] as const) {
        test(`bookmark ui: ${result.reason} ${phase} result prevents import success`, async () => {
            const restoreDom = installFakeDom();
            const previousConfirm = globalThis.confirm;
            const previousAlert = globalThis.alert;
            let confirmCount = 0;
            const alerts: string[] = [];
            globalThis.confirm = () => { confirmCount += 1; return true; };
            globalThis.alert = (message) => { alerts.push(String(message)); };
            try {
                const { ui, calls, controller } = createBookmarkHarness(phase === "preview"
                    ? { onPreviewBookmarkImportResult: result }
                    : { onImportBookmarksTextResult: result });
                controller.setupBookmarkHandlers();
                const importText = '{"version":3,"bookmarks":{}}';
                Object.defineProperty(ui.el.bookmarkPanelImportInput, "files", {
                    value: [new File([importText], "bookmarks.json", { type: "application/json" })],
                    configurable: true
                });
                await invokeListener(ui.el.bookmarkPanelImportInput, "change", {});

                assert.deepEqual(calls.previewImportArgs, [importText]);
                assert.deepEqual(calls.importTextArgs, phase === "preview" ? [] : [importText]);
                assert.equal(confirmCount, phase === "preview" ? 0 : 1);
                assert.deepEqual(alerts, []);
                assert.equal(ui.el.bookmarkPanelError.hidden, false);
                assert.equal(ui.el.bookmarkPanelError.textContent, importMessage);
                assert.equal(ui.el.bookmarkPanelImportInput.value, "");
            } finally {
                globalThis.confirm = previousConfirm;
                globalThis.alert = previousAlert;
                restoreDom();
            }
        });
    }
}
