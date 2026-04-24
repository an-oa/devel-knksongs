import test from "node:test";
import assert from "node:assert/strict";
import { createBookmarkDragReorderController } from "../app/lib/render/drag-reorder.mjs";
import {
    createDataTransferMock,
    installFakeDom,
    makeRenderRow
} from "./test-helpers.mjs";

function createDragHarness() {
    const data = {
        activeBookmark: "bookmark-1",
        bookmarks: {
            "bookmark-1": {
                name: "Bookmark",
                createdAt: 1,
                songs: ["song-a", "song-b", "song-c"]
            }
        },
        currentResults: [
            makeRenderRow({ songKey: "a", bookmarkSongKey: "song-a", sourceIndex: 1 }),
            makeRenderRow({ songKey: "b", bookmarkSongKey: "song-b", sourceIndex: 2 }),
            makeRenderRow({ songKey: "c", bookmarkSongKey: "song-c", sourceIndex: 3 })
        ]
    };
    const calls = {
        save: 0,
        update: 0
    };
    const controller = createBookmarkDragReorderController({
        data,
        getBookmarkSongRef: (row) => row.bookmarkSongKey,
        saveBookmarks: () => {
            calls.save += 1;
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
        assert.equal(calls.update, 1);
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
