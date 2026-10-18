import test from "node:test";
import assert from "node:assert/strict";
import { createBookmarkDragReorderController, findCardAtPoint } from "../app/lib/render/drag-reorder.mts";
import { createBookmarkReorderFixture } from "./support/bookmark-reorder-fixture.mts";
import {
    createDataTransferMock,
    getFakeElement,
    installFakeDom,
    makeRenderRow
} from "./test-helpers.mts";

type CardBox = { left: number; top: number; width: number; height: number };

/** 1 列に並べるときのカードの間隔。 */
const CARD_GAP = 10;

/**
 * カードの配置の位置を、一覧の中の順番と、前にあるカードの高さから決める。
 * 並べ替えて DOM の順番が変わると、位置も変わる。
 * @param card 結果カード
 * @param height カードの高さ
 */
function placeInOneColumn(card: HTMLElement, height: number) {
    const top = () => {
        const siblings: HTMLElement[] = card.parentElement ? Array.from(card.parentElement.children, (node) => node as HTMLElement) : [];
        return siblings.slice(0, siblings.indexOf(card)).reduce((sum, sibling) => sum + sibling.offsetHeight + CARD_GAP, 0);
    };
    Object.defineProperties(card, {
        offsetLeft: { get: () => 0, configurable: true },
        offsetTop: { get: top, configurable: true },
        offsetWidth: { get: () => 300, configurable: true },
        offsetHeight: { get: () => height, configurable: true }
    });
}

/**
 * カードの配置の位置を、並べ替えても動かない固定の位置にする。
 * @param card 結果カード
 * @param box 固定する位置と大きさ
 */
function placeAt(card: HTMLElement, box: CardBox) {
    Object.defineProperties(card, {
        offsetLeft: { get: () => box.left, configurable: true },
        offsetTop: { get: () => box.top, configurable: true },
        offsetWidth: { get: () => box.width, configurable: true },
        offsetHeight: { get: () => box.height, configurable: true }
    });
}

/**
 * ドラッグの状態、結果一覧、描き直しと保存の記録を作る。
 * 結果一覧は、描画と同じく並べ替え途中の順序（orderForPreview）で並べ直す。
 * @param options 保存の結果と、カードの高さ
 */
function createDragHarness(options: {
    saveResult?: import("../app/controllers/bookmark-persistence.mts").BookmarkSaveResult;
    heights?: Record<string, number>;
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
        render: 0,
        savedBookmarks: [] as import("../app/state.types").AppDataState["bookmarks"][],
        saveFailures: [] as import("../app/controllers/storage.mts").StorageActionFailure[]
    };
    const list = document.createElement("div");
    document.body.appendChild(list);
    const cards = new Map<string, HTMLElement>();
    for (const row of data.currentResults) {
        const card = document.createElement("div");
        card.className = "song-card";
        card.dataset.songKey = row.songKey;
        placeInOneColumn(card, options.heights?.[row.songKey] ?? 100);
        cards.set(row.songKey, card);
    }
    /** 描画と同じく、並べ替え途中の順序で結果一覧を並べ直す。 */
    const render = () => {
        calls.render += 1;
        const ordered = controller.orderForPreview(data.currentResults)
            .map((row) => cards.get(row.songKey))
            .filter((card): card is HTMLElement => card !== undefined);
        list.replaceChildren(...ordered);
    };
    const storageController = createBookmarkReorderFixture({
        data,
        saveBookmarks: (bookmarks) => {
            calls.save += 1;
            calls.savedBookmarks.push(bookmarks);
            return options.saveResult ?? { ok: true };
        },
        updateDisplay: render
    });
    const controller = createBookmarkDragReorderController({
        data,
        moveSongInActiveBookmark: storageController.moveSongInActiveBookmark,
        onSaveFailure: (result) => calls.saveFailures.push(result),
        refreshDisplay: render,
        getResultList: () => list
    });
    render();
    calls.render = 0;
    return { data, calls, controller, storageController, list, cards };
}

/**
 * 移動元カードのハンドルからドラッグを始める。
 * @param controller 並べ替えの controller
 * @param card 移動元のカード
 */
function startDragFrom(controller: ReturnType<typeof createDragHarness>["controller"], card: HTMLElement | undefined) {
    assert.ok(card);
    const handle = document.createElement("div");
    card.appendChild(handle);
    controller.onDragStart({
        currentTarget: handle,
        dataTransfer: createDataTransferMock(),
        preventDefault() {}
    });
    return handle;
}

/**
 * 一覧の左上から見た縦の位置で、ポインタの位置を持つ drag イベントを作る。
 * @param list 結果カードを並べた一覧
 * @param y 一覧の上端からの位置
 */
function createPointerEvent(list: HTMLElement, y: number) {
    const event = {
        target: list,
        clientX: 150,
        clientY: y,
        dataTransfer: createDataTransferMock(),
        prevented: false,
        preventDefault() {
            event.prevented = true;
        }
    };
    return event;
}

/**
 * 一覧に並んでいるカードの曲キーを、DOM 順に返す。
 * @param list 結果カードを並べた一覧
 */
function readListOrder(list: HTMLElement) {
    return Array.from(list.children, (card) => (card as HTMLElement).dataset.songKey);
}

test("render drag reorder: hovering another card shows the dragged card in its slot without saving", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller, list, cards } = createDragHarness();
        startDragFrom(controller, cards.get("a"));

        // c の上へ来ると、a が c の枠へ移り、b と c が 1 枠ずつ上へよける。
        const over = createPointerEvent(list, 270);
        controller.onDragOver(over);

        assert.equal(over.prevented, true);
        assert.deepEqual(readListOrder(list), ["b", "c", "a"]);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.equal(calls.save, 0);
        assert.equal(calls.render, 1);
    } finally {
        cleanup();
    }
});

test("render drag reorder: dropping saves the order shown during the drag", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller, list, cards } = createDragHarness();
        startDragFrom(controller, cards.get("a"));
        controller.onDragOver(createPointerEvent(list, 270));

        // 離す位置は、移った a の上でも、カードの間の隙間でもよい。
        const drop = createPointerEvent(list, 215);
        controller.onDrop(drop);

        assert.equal(drop.prevented, true);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["b", "c", "a"]);
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["song-b", "song-c", "song-a"]);
        assert.equal(calls.save, 1);
        assert.deepEqual(calls.saveFailures, []);
        assert.deepEqual(readListOrder(list), ["b", "c", "a"]);
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
        assert.equal(calls.render, 1);
        assert.equal(data.currentResults, originalResults);
        assert.equal(data.displayLimit, 2);
        assert.deepEqual(storageController.moveSongInActiveBookmark("a", "b"), { ok: true, changed: true });
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["hidden-1", "song-a", "hidden-2", "song-b", "song-c", "hidden-3"]);
    } finally {
        cleanup();
    }
});

test("render drag reorder: ending the drag without a drop puts the cards back in the saved order", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller, list, cards } = createDragHarness();
        const handle = startDragFrom(controller, cards.get("a"));
        controller.onDragOver(createPointerEvent(list, 270));
        assert.deepEqual(readListOrder(list), ["b", "c", "a"]);

        // 一覧の外で離したときや Esc で取り消したときは、drop が来ずに dragend だけが届く。
        controller.onDragEnd({ currentTarget: handle, dataTransfer: null, preventDefault() {} });

        assert.deepEqual(readListOrder(list), ["a", "b", "c"]);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.equal(calls.save, 0);
        assert.equal(cards.get("a")?.classList.contains("dragging"), false);
    } finally {
        cleanup();
    }
});

test("render drag reorder: a failed save is reported and the saved order comes back", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller, list, cards } = createDragHarness({
            saveResult: { ok: false, reason: "storage_write_failed" }
        });
        startDragFrom(controller, cards.get("a"));
        controller.onDragOver(createPointerEvent(list, 270));
        controller.onDrop(createPointerEvent(list, 270));

        assert.deepEqual(calls.saveFailures, [{ ok: false, reason: "storage_write_failed" }]);
        assert.deepEqual(calls.savedBookmarks[0]["bookmark-1"].songs, ["song-b", "song-c", "song-a"]);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["song-a", "song-b", "song-c"]);
        assert.deepEqual(readListOrder(list), ["a", "b", "c"]);
    } finally {
        cleanup();
    }
});

test("render drag reorder: a taller card that moved aside is skipped until the pointer leaves it", () => {
    const cleanup = installFakeDom();
    try {
        // c だけ背が高い。a 0-100、b 110-210、c 220-520 に並ぶ。
        const { controller, list, cards } = createDragHarness({ heights: { c: 300 } });
        startDragFrom(controller, cards.get("a"));

        controller.onDragOver(createPointerEvent(list, 300));
        // b 0-100、c 110-410、a 420-520 になり、ポインタは上へよけた c の上に残る。c へは戻らない。
        assert.deepEqual(readListOrder(list), ["b", "c", "a"]);
        controller.onDragOver(createPointerEvent(list, 350));
        controller.onDragOver(createPointerEvent(list, 200));
        assert.deepEqual(readListOrder(list), ["b", "c", "a"]);

        // いったん c から出て（a の上へ）、もう一度 c に入ると、a が c の枠へ移る。
        controller.onDragOver(createPointerEvent(list, 450));
        controller.onDragOver(createPointerEvent(list, 200));
        assert.deepEqual(readListOrder(list), ["b", "a", "c"]);
    } finally {
        cleanup();
    }
});

test("render drag reorder: the cards wait for the pointer to move before rearranging again", () => {
    const cleanup = installFakeDom();
    try {
        const { controller, list, cards } = createDragHarness();
        // 並べ替えても動かない位置にし、並べ替えた直後にポインタのすぐそばへ別のカードが来た状況を作る。
        // b（110-228）と c（224-324）が少し重なるようにし、DOM 順で先に来る b がその重なりで選ばれるようにする。
        placeAt(cards.get("a") ?? list, { left: 0, top: 0, width: 300, height: 100 });
        placeAt(cards.get("b") ?? list, { left: 0, top: 110, width: 300, height: 118 });
        placeAt(cards.get("c") ?? list, { left: 0, top: 224, width: 300, height: 100 });
        startDragFrom(controller, cards.get("a"));

        controller.onDragOver(createPointerEvent(list, 230));
        assert.deepEqual(readListOrder(list), ["b", "c", "a"]);

        // 3px しか動いていないので、b の上でも並べ替えない。
        controller.onDragOver(createPointerEvent(list, 227));
        assert.deepEqual(readListOrder(list), ["b", "c", "a"]);

        controller.onDragOver(createPointerEvent(list, 215));
        assert.deepEqual(readListOrder(list), ["a", "b", "c"]);
    } finally {
        cleanup();
    }
});

test("render drag reorder: drags not started from a handle are accepted without rearranging the cards", () => {
    const cleanup = installFakeDom();
    try {
        const { data, calls, controller, list } = createDragHarness();

        // タイトルのリンクや外部のファイルのドラッグは、ハンドルの dragstart を通らない。
        const enter = createPointerEvent(list, 270);
        controller.onDragEnter(enter);
        const over = createPointerEvent(list, 270);
        controller.onDragOver(over);
        const drop = createPointerEvent(list, 270);
        drop.dataTransfer.setData("text/plain", "a");
        controller.onDrop(drop);

        assert.equal(enter.prevented, true);
        assert.equal(over.prevented, true);
        assert.equal(drop.prevented, true);
        assert.deepEqual(readListOrder(list), ["a", "b", "c"]);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.equal(calls.render, 0);
        assert.equal(calls.save, 0);
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
        const { data, calls, controller, list, cards } = createDragHarness();
        let prevented = false;
        controller.onDragStart({
            currentTarget: cards.get("c"),
            dataTransfer: null,
            preventDefault() { prevented = true; }
        });
        controller.onDragOver(createPointerEvent(list, 50));
        controller.onDrop(createPointerEvent(list, 50));

        assert.equal(prevented, true);
        assert.deepEqual(data.currentResults.map((row) => row.songKey), ["a", "b", "c"]);
        assert.deepEqual(data.bookmarks["bookmark-1"].songs, ["song-a", "song-b", "song-c"]);
        assert.equal(calls.save, 0);
        assert.equal(calls.render, 0);
    } finally {
        cleanup();
    }
});

test("render drag reorder: drag start uses the whole card as the drag image at the grabbed point", () => {
    const cleanup = installFakeDom();
    try {
        const { controller, cards } = createDragHarness();
        const card = cards.get("a");
        assert.ok(card);
        getFakeElement(card)._rect = { top: 50, bottom: 150, left: 100, right: 400, width: 300, height: 100 };
        const handle = document.createElement("div");
        card.appendChild(handle);
        const dragImages: { image: Element; x: number; y: number }[] = [];
        const dataTransfer = {
            ...createDataTransferMock(),
            setDragImage(image: Element, x: number, y: number) {
                dragImages.push({ image, x, y });
            }
        };

        controller.onDragStart({ currentTarget: handle, clientX: 370, clientY: 60, dataTransfer, preventDefault() {} });

        assert.deepEqual(dragImages, [{ image: card, x: 270, y: 10 }]);
    } finally {
        cleanup();
    }
});

test("render drag reorder: finds the card under the pointer by its laid-out box", () => {
    const cleanup = installFakeDom();
    try {
        const { list, cards } = createDragHarness();
        // a 0-100、b 110-210、c 220-320。上端と左端は含み、下端と右端は含まない。
        assert.equal(findCardAtPoint(list, { x: 0, y: 0 }), cards.get("a"));
        assert.equal(findCardAtPoint(list, { x: 299, y: 99 }), cards.get("a"));
        assert.equal(findCardAtPoint(list, { x: 150, y: 100 }), null);
        assert.equal(findCardAtPoint(list, { x: 150, y: 110 }), cards.get("b"));
        assert.equal(findCardAtPoint(list, { x: 300, y: 150 }), null);
        assert.equal(findCardAtPoint(list, { x: 150, y: 319 }), cards.get("c"));
    } finally {
        cleanup();
    }
});
