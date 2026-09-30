import test from "node:test";
import assert from "node:assert/strict";
import { createBookmarkDragReorderController } from "../app/lib/render/drag-reorder.mts";
import {
    createDataTransferMock,
    installFakeDom,
    makeRenderRow
} from "./test-helpers.mts";

/** ドラッグ対象の状態と永続化呼び出し記録を作る。 */
function createDragHarness(options: {
    saveResult?: import("../app/controllers/bookmark-persistence.mts").BookmarkSaveResult;
} = {}) {
    const data: Parameters<typeof createBookmarkDragReorderController>[0]["data"] = {
        activeBookmark: "bookmark-1",
        bookmarks: {
            "bookmark-1": {
                name: "Bookmark",
                createdAt: 1,
                songs: ["song-a", "song-b", "song-c"]
            }
        },
        currentResults: [
            makeRenderRow({ songKey: "a", bookmarkSongKey: "song-a"}),
            makeRenderRow({ songKey: "b", bookmarkSongKey: "song-b"}),
            makeRenderRow({ songKey: "c", bookmarkSongKey: "song-c"})
        ]
    };
    const calls = {
        save: 0,
        update: 0,
        savedBookmarks: [] as Parameters<typeof createBookmarkDragReorderController>[0]["data"]["bookmarks"][],
        saveFailures: [] as import("../app/controllers/bookmark-persistence.mts").BookmarkSaveFailure[]
    };
    const controller = createBookmarkDragReorderController({
        data,
        getBookmarkSongRef: (row) => row.bookmarkSongKey,
        saveBookmarks: (bookmarks) => {
            calls.save += 1;
            calls.savedBookmarks.push(bookmarks);
            return options.saveResult ?? { ok: true };
        },
        onSaveFailure: (result) => {
            calls.saveFailures.push(result);
        },
        updateDisplay: () => {
            calls.update += 1;
        }
    });
    return { data, calls, controller };
}

test("render drag reorder: drop reorders results and persists bookmark order", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller } = createDragHarness();
        const firstCard = document.createElement("div");
        const thirdCard = document.createElement("div");
        firstCard.className = "song-card";
        thirdCard.className = "song-card";
        firstCard.dataset.songKey = "a";
        thirdCard.dataset.songKey = "c";
        const dragHandle = document.createElement("div");
        firstCard.appendChild(dragHandle);
        const dataTransfer = createDataTransferMock();

        controller.onDragStart({
            currentTarget: dragHandle,
            dataTransfer,
            preventDefault() {}
        });
        controller.onDrop({
            target: thirdCard,
            dataTransfer,
            preventDefault() {}
        });

        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["b", "c", "a"]);
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["song-b", "song-c", "song-a"]);
        assert.equal(calls.save, 1);
        assert.deepEqual(calls.savedBookmarks[0]["bookmark-1"].songs, ["song-b", "song-c", "song-a"]);
        assert.deepEqual(calls.saveFailures, []);
        assert.equal(calls.update, 1);
    } finally {
        cleanup();
    }
});

test("render drag reorder: failed persistence is reported without changing order", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller } = createDragHarness({
            saveResult: { ok: false, reason: "storage_write_failed" }
        });
        const firstCard = document.createElement("div");
        const thirdCard = document.createElement("div");
        firstCard.className = "song-card";
        thirdCard.className = "song-card";
        firstCard.dataset.songKey = "a";
        thirdCard.dataset.songKey = "c";
        const dragHandle = document.createElement("div");
        firstCard.appendChild(dragHandle);
        const dataTransfer = createDataTransferMock();

        controller.onDragStart({
            currentTarget: dragHandle,
            dataTransfer,
            preventDefault() {}
        });
        controller.onDrop({
            target: thirdCard,
            dataTransfer,
            preventDefault() {}
        });

        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["song-a", "song-b", "song-c"]);
        assert.deepEqual(calls.savedBookmarks[0]["bookmark-1"].songs, ["song-b", "song-c", "song-a"]);
        assert.deepEqual(calls.saveFailures, [
            { ok: false, reason: "storage_write_failed" }
        ]);
        assert.equal(calls.save, 1);
        assert.equal(calls.update, 0);
    } finally {
        cleanup();
    }
});

test("render drag reorder: drag start is ignored outside bookmark mode", () => {
    const cleanup = installFakeDom();
    try {
        const { data, controller } = createDragHarness();
        data.activeBookmark = null;
        let prevented = false;
        controller.onDragStart({
            currentTarget: document.createElement("div"),
            dataTransfer: createDataTransferMock(),
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(prevented, true);
    } finally {
        cleanup();
    }
});

test("render drag reorder: missing drag data leaves bookmark order unchanged", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller } = createDragHarness();
        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = "c";
        let prevented = false;
        controller.onDragStart({
            currentTarget: card,
            dataTransfer: null,
            preventDefault() { prevented = true; }
        });
        controller.onDrop({
            target: card,
            dataTransfer: null,
            preventDefault() {}
        });

        assert.equal(prevented, true);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["song-a", "song-b", "song-c"]);
        assert.equal(calls.save, 0);
        assert.equal(calls.update, 0);
    } finally {
        cleanup();
    }
});
