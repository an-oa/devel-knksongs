import test from "node:test";
import assert from "node:assert/strict";
import { createBookmarkDragReorderController } from "../app/lib/render/drag-reorder.mts";
import { createBookmarkReorderFixture } from "./support/bookmark-reorder-fixture.mts";
import {
    createDataTransferMock,
    installFakeDom,
    makeRenderRow
} from "./test-helpers.mts";

/** ドラッグ対象の状態と永続化呼び出し記録を作る。 */
function createDragHarness(options: {
    saveResult?: import("../app/controllers/bookmark-persistence.mts").BookmarkSaveResult;
} = {}) {
    const data: import("../app/state.types").AppDataState = {
        allSongsRaw: [],
        displayLimit: 48,
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
        savedBookmarks: [] as import("../app/state.types").AppDataState["bookmarks"][],
        saveFailures: [] as import("../app/controllers/storage.mts").StorageActionFailure[]
    };
    const storageController = createBookmarkReorderFixture({
        data,
        saveBookmarks: (bookmarks) => {
            calls.save += 1;
            calls.savedBookmarks.push(bookmarks);
            return options.saveResult ?? { ok: true };
        },
        updateDisplay: () => {
            calls.update += 1;
        }
    });
    const controller = createBookmarkDragReorderController({
        data,
        moveSongInActiveBookmark: storageController.moveSongInActiveBookmark,
        onSaveFailure: (result) => calls.saveFailures.push(result)
    });
    return { data, calls, controller, storageController };
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

test("bookmark reorder: moves only visible songs and keeps hidden songs in their slots", () => {
    const cleanup = installFakeDom();
    try {
        const { data, storageController, calls } = createDragHarness();
        const originalResults = data.currentResults;
        data.displayLimit = 2;
        data.bookmarks["bookmark-1"].songs = ["hidden-1", "song-a", "hidden-2", "song-b", "song-c", "hidden-3"];
        assert.deepEqual(storageController.moveSongInActiveBookmark("a", "c"), { ok: true, changed: true });
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["hidden-1", "song-b", "hidden-2", "song-c", "song-a", "hidden-3"]);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["b", "c", "a"]);
        assert.equal(calls.save, 1);
        assert.equal(calls.update, 1);
        assert.equal(data.currentResults, originalResults);
        assert.equal(data.displayLimit, 2);
        assert.deepEqual(storageController.moveSongInActiveBookmark("a", "b"), { ok: true, changed: true });
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["hidden-1", "song-a", "hidden-2", "song-b", "song-c", "hidden-3"]);
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

/** 曲キーを持つカードと、その中のタイトル・本文の要素を作る。 */
function createCardWithChildren(songKey: string) {
    const card = document.createElement("div");
    card.className = "song-card";
    card.dataset.songKey = songKey;
    const title = document.createElement("a");
    const body = document.createElement("div");
    card.append(title, body);
    document.body.appendChild(card);
    return { card, title, body };
}

/** preventDefault が呼ばれたかを記録する drag イベントを作る。 */
function createDragEvent(target: EventTarget, relatedTarget: EventTarget | null = null) {
    const event = {
        target,
        relatedTarget,
        dataTransfer: createDataTransferMock(),
        prevented: false,
        preventDefault() {
            event.prevented = true;
        }
    };
    return event;
}

/** 移動元カードのハンドルからドラッグを始める。 */
function startDragFrom(controller: ReturnType<typeof createDragHarness>["controller"], card: HTMLElement) {
    const handle = document.createElement("div");
    card.appendChild(handle);
    controller.onDragStart({
        currentTarget: handle,
        dataTransfer: createDataTransferMock(),
        preventDefault() {}
    });
    return handle;
}

test("render drag reorder: dragenter and dragover accept the drop and outline only other cards", () => {
    const cleanup = installFakeDom();
    try {
        const { controller } = createDragHarness();
        const source = createCardWithChildren("a");
        const target = createCardWithChildren("c");
        startDragFrom(controller, source.card);

        const enterTarget = createDragEvent(target.title);
        controller.onDragEnter(enterTarget);
        assert.equal(enterTarget.prevented, true);
        assert.equal(target.card.classList.contains("drag-over"), true);

        const overSource = createDragEvent(source.body);
        controller.onDragOver(overSource);
        assert.equal(overSource.prevented, true);
        assert.equal(source.card.classList.contains("drag-over"), false);
    } finally {
        cleanup();
    }
});

test("render drag reorder: moving between elements of the same card keeps the outline", () => {
    const cleanup = installFakeDom();
    try {
        const { controller } = createDragHarness();
        const source = createCardWithChildren("a");
        const target = createCardWithChildren("c");
        startDragFrom(controller, source.card);
        controller.onDragEnter(createDragEvent(target.title));

        // 子要素の境目を越えると、離れた要素に dragleave が届く。移る先が同じカードなら枠を保つ。
        controller.onDragLeave(createDragEvent(target.title, target.body));
        assert.equal(target.card.classList.contains("drag-over"), true);

        controller.onDragLeave(createDragEvent(target.body, source.body));
        assert.equal(target.card.classList.contains("drag-over"), false);

        controller.onDragEnter(createDragEvent(target.body));
        controller.onDragLeave(createDragEvent(target.body, null));
        assert.equal(target.card.classList.contains("drag-over"), false);
    } finally {
        cleanup();
    }
});

test("render drag reorder: drags not started from a handle are accepted without an outline or a move", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller } = createDragHarness();
        createCardWithChildren("a");
        const target = createCardWithChildren("c");

        // タイトルのリンクや外部のファイルのドラッグは、ハンドルの dragstart を通らない。
        const over = createDragEvent(target.title);
        controller.onDragOver(over);
        assert.equal(over.prevented, true);
        assert.equal(target.card.classList.contains("drag-over"), false);

        const drop = createDragEvent(target.title);
        drop.dataTransfer.setData("text/plain", "a");
        controller.onDrop(drop);
        assert.equal(drop.prevented, true);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.equal(calls.save, 0);
    } finally {
        cleanup();
    }
});

test("render drag reorder: drag end forgets the dragged song", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller } = createDragHarness();
        const source = createCardWithChildren("a");
        const target = createCardWithChildren("c");
        const handle = startDragFrom(controller, source.card);
        controller.onDragEnd({ currentTarget: handle, dataTransfer: null, preventDefault() {} });

        controller.onDragOver(createDragEvent(target.body));
        assert.equal(target.card.classList.contains("drag-over"), false);
        controller.onDrop(createDragEvent(target.body));
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.equal(calls.save, 0);
    } finally {
        cleanup();
    }
});
