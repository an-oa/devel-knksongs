import test from "node:test";
import assert from "node:assert/strict";
import { createRenderController } from "../render.mjs";
import { createSearchController } from "../search.mjs";
import { extractYoutubeInfo } from "../youtube.mjs";
import {
    installFakeDom,
    makeRenderRow,
    createDataTransferMock,
    invokeListener
} from "./test-helpers.mjs";

/**
 * render 系テスト用の UI 状態を作る。
 * @param {*} input
 * @returns {*}
 */
function createRenderUiState(input) {
    return {
        el: input.el,
        search: {
            selectedFormats: input.selectedFormats ?? new Set(["配信"]),
            dataReady: input.dataReady ?? true,
            debounceId: input.debounceId ?? 0,
            recommendedCache: null,
            userTouchedQuery: false,
            userTouchedFilters: false,
            hasRestoredSearchState: false
        },
        date: {
            bounds: null,
            index: null,
            pendingValues: null
        },
        playback: {
            activeThumb: input.activeThumb ?? null,
            showThumbnails: input.showThumbnails ?? false,
            scrollObserver: input.scrollObserver ?? null
        },
        render: {
            cardEntriesBySourceKey: input.cardEntriesBySourceKey ?? new Map()
        },
        lookup: {
            songMapByKey: new Map(),
            songMapByLegacyIndex: new Map(),
            songLookupSourceRef: null
        }
    };
}

test("render: empty results stop active playback", () => {
    const cleanup = installFakeDom();
    try {
        const data = {
            currentResults: [],
            displayLimit: 48,
            activeBookmark: null
        };
        const ui = createRenderUiState({
            activeThumb: document.createElement("div"),
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        let restoreCount = 0;
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: () => ({ videoId: "video1", startSeconds: 0 }),
            restoreActivePlayback: () => {
                restoreCount += 1;
            }
        });

        controller.updateDisplay();
        assert.equal(restoreCount, 1);
    } finally {
        cleanup();
    }
});

test("render: active card kept in next nodes does not stop playback", () => {
    const cleanup = installFakeDom();
    try {
        const row = makeRenderRow({ songKey: "a::1", sourceIndex: 1 });
        const data = {
            currentResults: [row],
            displayLimit: 10,
            activeBookmark: null
        };
        const ui = createRenderUiState({
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        let restoreCount = 0;
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: () => ({ videoId: "video1", startSeconds: 0 }),
            restoreActivePlayback: () => {
                restoreCount += 1;
            }
        });

        controller.updateDisplay();
        const entry = ui.render.cardEntriesBySourceKey.get(`song:${row.songKey}`);
        assert.ok(entry);

        ui.playback.activeThumb = entry.thumbDiv;
        ui.playback.activeThumb.appendChild(document.createElement("iframe"));
        controller.updateDisplay();

        assert.equal(restoreCount, 0);
    } finally {
        cleanup();
    }
});

test("render: active card hidden from next nodes stops playback", () => {
    const cleanup = installFakeDom();
    try {
        const rowA = makeRenderRow({ songKey: "a::1", sourceIndex: 1 });
        const rowB = makeRenderRow({ songKey: "b::2", sourceIndex: 2, url: "https://youtu.be/video2" });
        const data = {
            currentResults: [rowA],
            displayLimit: 10,
            activeBookmark: null
        };
        const ui = createRenderUiState({
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        let restoreCount = 0;
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: () => ({ videoId: "video1", startSeconds: 0 }),
            restoreActivePlayback: () => {
                restoreCount += 1;
            }
        });

        controller.updateDisplay();
        const entryA = ui.render.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        assert.ok(entryA);
        ui.playback.activeThumb = entryA.thumbDiv;
        ui.playback.activeThumb.appendChild(document.createElement("iframe"));

        data.currentResults = [rowB];
        controller.updateDisplay();

        assert.equal(restoreCount, 1);
    } finally {
        cleanup();
    }
});

test("render: cards keep fixed columns while preserving DOM order", () => {
    const cleanup = installFakeDom();
    try {
        const rowA = makeRenderRow({ songKey: "a::1", sourceIndex: 1 });
        const rowB = makeRenderRow({ songKey: "b::2", sourceIndex: 2, url: "https://www.youtube.com/shorts/video2" });
        const data = {
            currentResults: [rowA, rowB],
            displayLimit: 10,
            activeBookmark: null
        };
        const ui = createRenderUiState({
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        ui.el.resultList._clientWidth = 700;
        ui.el.resultList._rect = { top: 0, bottom: 200, left: 0, right: 700, width: 700, height: 200 };
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: () => ({ videoId: "video1", startSeconds: 0 }),
            restoreActivePlayback: () => {}
        });

        controller.updateDisplay();
        const entryA = ui.render.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        const entryB = ui.render.cardEntriesBySourceKey.get(`song:${rowB.songKey}`);
        assert.equal(ui.el.resultList.children[0], entryA.card);
        assert.equal(ui.el.resultList.children[1], entryB.card);
        assert.equal(entryA.card.style.width, "344px");
        assert.equal(entryA.card.style.left, "0px");
        assert.equal(entryA.card.style.top, "0px");
        assert.equal(entryA.card.dataset.layoutColumn, "0");
        assert.equal(entryB.card.style.width, "344px");
        assert.equal(entryB.card.style.left, "356px");
        assert.equal(entryB.card.style.top, "0px");
        assert.equal(entryB.card.dataset.layoutColumn, "1");
        assert.equal(ui.el.resultList.style.height, "100px");
    } finally {
        cleanup();
    }
});

test("render: card height changes only shift cards in the same column", () => {
    const cleanup = installFakeDom();
    try {
        const rows = [
            makeRenderRow({ songKey: "a::1", sourceIndex: 1 }),
            makeRenderRow({ songKey: "b::2", sourceIndex: 2 }),
            makeRenderRow({ songKey: "c::3", sourceIndex: 3 }),
            makeRenderRow({ songKey: "d::4", sourceIndex: 4 })
        ];
        const data = {
            currentResults: rows,
            displayLimit: 10,
            activeBookmark: null
        };
        const ui = createRenderUiState({
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        ui.el.resultList._clientWidth = 700;
        ui.el.resultList._rect = { top: 0, bottom: 200, left: 0, right: 700, width: 700, height: 200 };
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: () => ({ videoId: "video1", startSeconds: 0 }),
            restoreActivePlayback: () => {}
        });

        controller.updateDisplay();
        const entryA = ui.render.cardEntriesBySourceKey.get("song:a::1");
        const entryB = ui.render.cardEntriesBySourceKey.get("song:b::2");
        const entryC = ui.render.cardEntriesBySourceKey.get("song:c::3");
        const entryD = ui.render.cardEntriesBySourceKey.get("song:d::4");
        assert.ok(entryA);
        assert.ok(entryB);
        assert.ok(entryC);
        assert.ok(entryD);

        assert.equal(entryA.card.style.top, "0px");
        assert.equal(entryB.card.style.top, "0px");
        assert.equal(entryC.card.style.top, "112px");
        assert.equal(entryD.card.style.top, "112px");

        entryA.card._scrollHeight = 400;
        controller.refreshLayout();

        assert.equal(entryA.card.style.top, "0px");
        assert.equal(entryB.card.style.top, "0px");
        assert.equal(entryC.card.style.top, "412px");
        assert.equal(entryD.card.style.top, "112px");
        assert.equal(ui.el.resultList.style.height, "512px");

        entryA.card._scrollHeight = 100;
        controller.refreshLayout();

        assert.equal(entryC.card.style.top, "112px");
        assert.equal(entryD.card.style.top, "112px");
        assert.equal(ui.el.resultList.style.height, "212px");
    } finally {
        cleanup();
    }
});

test("render: refreshLayout shrinks container height after card height decreases", () => {
    const cleanup = installFakeDom();
    try {
        const row = makeRenderRow({ songKey: "a::1", sourceIndex: 1 });
        const data = {
            currentResults: [row],
            displayLimit: 10,
            activeBookmark: null
        };
        const ui = createRenderUiState({
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: () => ({ videoId: "video1", startSeconds: 0 }),
            restoreActivePlayback: () => {}
        });

        controller.updateDisplay();
        const entry = ui.render.cardEntriesBySourceKey.get(`song:${row.songKey}`);
        entry.card._scrollHeight = 400;
        controller.refreshLayout();
        assert.equal(ui.el.resultList.style.height, "400px");

        entry.card._scrollHeight = 100;
        controller.refreshLayout();
        assert.equal(ui.el.resultList.style.height, "100px");
    } finally {
        cleanup();
    }
});

test("render: explicit video orientation overrides URL heuristic", () => {
    const cleanup = installFakeDom();
    try {
        const row = makeRenderRow({
            songKey: "a::1",
            sourceIndex: 1,
            url: "https://youtu.be/video1",
            videoOrientation: "vertical"
        });
        const data = {
            currentResults: [row],
            displayLimit: 10,
            activeBookmark: null
        };
        const ui = createRenderUiState({
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        let received = null;
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: (_, yt) => {
                received = yt;
            },
            extractYoutubeInfo,
            restoreActivePlayback: () => {}
        });

        controller.updateDisplay();
        assert.equal(received && received.isVertical, true);
    } finally {
        cleanup();
    }
});

test("bookmark: shows load-more and increases by INCREMENT_COUNT (48)", () => {
    const cleanup = installFakeDom();
    try {
        const rows = Array.from({ length: 100 }, (_, index) => ({
            sourceIndex: index + 1,
            songKey: `song-${index + 1}`,
            title: `曲${index + 1}`,
            artist: "artist",
            date: "2024-01-01",
            dateKey: 20240101,
            format: "配信",
            isRelay: false,
            isHarmony: false,
            url: `https://youtu.be/video${index + 1}`,
            titleNorm: "",
            artistNorm: "",
            titleYomiNorm: "",
            artistYomiNorm: ""
        }));
        const data = {
            allSongsRaw: rows,
            bookmarks: {
                bm1: {
                    name: "100件",
                    songs: rows.map((row) => row.songKey)
                }
            },
            activeBookmark: "bm1",
            currentResults: [],
            displayLimit: 0
        };
        const loadMoreContainer = document.createElement("div");
        loadMoreContainer.classList.add("hidden");
        const ui = createRenderUiState({
            debounceId: 0,
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer,
                resultCount: { innerText: "" },
                searchBox: { value: "" },
                relayOnly: { checked: false },
                harmonyOnly: { checked: false },
                dateFromYear: null,
                dateFromMonth: null,
                dateFromDay: null,
                dateToYear: null,
                dateToMonth: null,
                dateToDay: null
            }
        });

        const renderController = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        renderController.setDependencies({
            getSearchState: () => ({
                queryRaw: "",
                relayOnly: false,
                harmonyOnly: false,
                dateFromKey: null,
                dateToKey: null,
                hasDateFilter: false
            }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: (url) => ({ videoId: String(url || ""), startSeconds: 0 }),
            restoreActivePlayback: () => {}
        });

        const searchController = createSearchController({
            data,
            ui,
            constants: {
                RANDOM_DISPLAY_COUNT: 48,
                MIN_PERFORMANCE_FOR_RANDOM: 3,
                INCREMENT_COUNT: 48,
                SEARCH_DEBOUNCE_MS: 0,
                DEFAULT_FORMATS: ["配信", "歌みた", "ショート", "切り抜き"]
            }
        });
        searchController.setRenderHooks({
            updateDisplay: () => renderController.updateDisplay(),
            scrollResultsPaneToTop: () => {}
        });

        searchController.search();
        assert.equal(data.currentResults.length, 100);
        assert.equal(data.displayLimit, 48);
        assert.equal(ui.el.resultList.children.length, 48);
        assert.equal(loadMoreContainer.classList.contains("hidden"), false);

        data.displayLimit += 48;
        renderController.updateDisplay();
        assert.equal(data.displayLimit, 96);
        assert.equal(ui.el.resultList.children.length, 96);
        assert.equal(loadMoreContainer.classList.contains("hidden"), false);

        data.displayLimit += 48;
        renderController.updateDisplay();
        assert.equal(data.displayLimit, 144);
        assert.equal(ui.el.resultList.children.length, 100);
        assert.equal(loadMoreContainer.classList.contains("hidden"), true);
    } finally {
        cleanup();
    }
});

test("render: drag handle is bookmark-only and reorder works in both directions with persistence", () => {
    const cleanup = installFakeDom();
    try {
        const rowA = makeRenderRow({ songKey: "a::1", sourceIndex: 1, title: "A" });
        const rowB = makeRenderRow({ songKey: "b::2", sourceIndex: 2, title: "B", url: "https://youtu.be/video2" });
        const data = {
            currentResults: [rowA, rowB],
            displayLimit: 10,
            activeBookmark: null,
            bookmarks: {
                bm1: {
                    name: "test",
                    songs: [rowA.songKey, rowB.songKey]
                }
            }
        };
        const ui = createRenderUiState({
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        let saveCount = 0;
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: () => ({ videoId: "video1", startSeconds: 0 }),
            restoreActivePlayback: () => {},
            saveBookmarks: () => {
                saveCount += 1;
            }
        });

        controller.updateDisplay();
        const normalEntryA = ui.render.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        assert.ok(normalEntryA);
        assert.equal(normalEntryA.dragHandle.hidden, true);
        assert.equal(normalEntryA.dragHandle.draggable, false);
        assert.equal(normalEntryA.card.draggable, false);
        assert.equal(normalEntryA.card._events.has("dragstart"), false);

        data.activeBookmark = "bm1";
        controller.updateDisplay();
        const entryA = ui.render.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        const entryB = ui.render.cardEntriesBySourceKey.get(`song:${rowB.songKey}`);
        assert.ok(entryA);
        assert.ok(entryB);
        assert.equal(entryA.dragHandle.hidden, false);
        assert.equal(entryA.dragHandle.draggable, true);

        const transfer1 = createDataTransferMock();
        invokeListener(entryA.dragHandle, "dragstart", {
            currentTarget: entryA.dragHandle,
            target: entryA.dragHandle,
            dataTransfer: transfer1,
            preventDefault() {}
        });
        invokeListener(entryB.card, "drop", {
            target: entryB.card,
            dataTransfer: transfer1,
            preventDefault() {}
        });
        assert.deepEqual(data.currentResults.map((row) => row.songKey), [rowB.songKey, rowA.songKey]);
        assert.deepEqual(data.bookmarks.bm1.songs, [rowB.songKey, rowA.songKey]);
        assert.equal(saveCount, 1);

        const transfer2 = createDataTransferMock();
        invokeListener(entryA.dragHandle, "dragstart", {
            currentTarget: entryA.dragHandle,
            target: entryA.dragHandle,
            dataTransfer: transfer2,
            preventDefault() {}
        });
        invokeListener(entryB.card, "drop", {
            target: entryB.card,
            dataTransfer: transfer2,
            preventDefault() {}
        });
        assert.deepEqual(data.currentResults.map((row) => row.songKey), [rowA.songKey, rowB.songKey]);
        assert.deepEqual(data.bookmarks.bm1.songs, [rowA.songKey, rowB.songKey]);
        assert.equal(saveCount, 2);
    } finally {
        cleanup();
    }
});

test("render: active playback card can move back left without jumping to the end", () => {
    const cleanup = installFakeDom();
    try {
        const rowA = makeRenderRow({ songKey: "a::1", sourceIndex: 1, title: "A" });
        const rowB = makeRenderRow({ songKey: "b::2", sourceIndex: 2, title: "B" });
        const rowC = makeRenderRow({ songKey: "c::3", sourceIndex: 3, title: "C" });
        const rowD = makeRenderRow({ songKey: "d::4", sourceIndex: 4, title: "D" });
        const data = {
            currentResults: [rowA, rowB, rowC, rowD],
            displayLimit: 10,
            activeBookmark: "bm1",
            bookmarks: {
                bm1: {
                    name: "test",
                    songs: [rowA.songKey, rowB.songKey, rowC.songKey, rowD.songKey]
                }
            }
        };
        const ui = createRenderUiState({
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        });
        const controller = createRenderController({
            data,
            ui,
            isAllFormatsSelected: () => true
        });
        controller.setDependencies({
            getSearchState: () => ({ queryRaw: "" }),
            isRecommendedMode: () => false,
            updateThumbnail: () => {},
            extractYoutubeInfo: () => ({ videoId: "video1", startSeconds: 0 }),
            restoreActivePlayback: () => {},
            saveBookmarks: () => {}
        });

        controller.updateDisplay();
        const entryA = ui.render.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        const entryB = ui.render.cardEntriesBySourceKey.get(`song:${rowB.songKey}`);
        assert.ok(entryA);
        assert.ok(entryB);

        ui.playback.activeThumb = entryA.thumbDiv;
        ui.playback.activeThumb.appendChild(document.createElement("iframe"));
        const movedNodes = [];
        const originalInsertBefore = ui.el.resultList.insertBefore.bind(ui.el.resultList);
        ui.el.resultList.insertBefore = (node, referenceNode) => {
            movedNodes.push(node);
            return originalInsertBefore(node, referenceNode);
        };

        const transferRight = createDataTransferMock();
        invokeListener(entryA.dragHandle, "dragstart", {
            currentTarget: entryA.dragHandle,
            target: entryA.dragHandle,
            dataTransfer: transferRight,
            preventDefault() {}
        });
        invokeListener(entryB.card, "drop", {
            target: entryB.card,
            dataTransfer: transferRight,
            preventDefault() {}
        });
        assert.deepEqual(data.currentResults.map((row) => row.songKey), [
            rowB.songKey,
            rowA.songKey,
            rowC.songKey,
            rowD.songKey
        ]);

        const transferLeft = createDataTransferMock();
        invokeListener(entryA.dragHandle, "dragstart", {
            currentTarget: entryA.dragHandle,
            target: entryA.dragHandle,
            dataTransfer: transferLeft,
            preventDefault() {}
        });
        invokeListener(entryB.card, "drop", {
            target: entryB.card,
            dataTransfer: transferLeft,
            preventDefault() {}
        });

        assert.deepEqual(data.currentResults.map((row) => row.songKey), [
            rowA.songKey,
            rowB.songKey,
            rowC.songKey,
            rowD.songKey
        ]);
        assert.deepEqual(data.bookmarks.bm1.songs, [
            rowA.songKey,
            rowB.songKey,
            rowC.songKey,
            rowD.songKey
        ]);
        assert.deepEqual(
            ui.el.resultList.children.map((card) => card.dataset.songKey),
            [rowA.songKey, rowB.songKey, rowC.songKey, rowD.songKey]
        );
        assert.equal(
            movedNodes.includes(entryA.card),
            false,
            "active playback card should stay mounted to preserve current position"
        );
    } finally {
        cleanup();
    }
});
