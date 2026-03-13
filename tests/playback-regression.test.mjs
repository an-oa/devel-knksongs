import test from "node:test";
import assert from "node:assert/strict";
import { createRenderController } from "../render.mjs";
import { createSearchController } from "../search.mjs";
import { createYoutubeController, extractYoutubeInfo } from "../youtube.mjs";

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(...tokens) {
        tokens.forEach((token) => {
            if (token) this.values.add(token);
        });
    }

    remove(...tokens) {
        tokens.forEach((token) => this.values.delete(token));
    }

    contains(token) {
        return this.values.has(token);
    }

    toggle(token, force) {
        if (force === true) {
            this.values.add(token);
            return true;
        }
        if (force === false) {
            this.values.delete(token);
            return false;
        }
        if (this.values.has(token)) {
            this.values.delete(token);
            return false;
        }
        this.values.add(token);
        return true;
    }

    toString() {
        return Array.from(this.values).join(" ");
    }
}

class FakeElement {
    constructor(tagName = "div") {
        this.tagName = String(tagName).toUpperCase();
        this.dataset = {};
        this.children = [];
        this.parentElement = null;
        this.classList = new FakeClassList();
        this.style = {};
        this.attributes = new Map();
        this.onclick = null;
        this.textContent = "";
        this.innerHTML = "";
        this.hidden = false;
        this.type = "";
        this._events = new Map();
    }

    get className() {
        return this.classList.toString();
    }

    set className(value) {
        this.classList = new FakeClassList();
        String(value || "")
            .split(/\s+/)
            .filter(Boolean)
            .forEach((token) => this.classList.add(token));
    }

    get firstChild() {
        return this.children[0] || null;
    }

    get lastElementChild() {
        return this.children[this.children.length - 1] || null;
    }

    get nextSibling() {
        if (!this.parentElement) return null;
        const siblings = this.parentElement.children;
        const index = siblings.indexOf(this);
        if (index < 0) return null;
        return siblings[index + 1] || null;
    }

    get isConnected() {
        const body = globalThis.document && globalThis.document.body;
        if (!body) return false;
        let node = this;
        while (node) {
            if (node === body) return true;
            node = node.parentElement;
        }
        return false;
    }

    get scrollHeight() {
        return 100;
    }

    get clientHeight() {
        return 100;
    }

    appendChild(child) {
        if (child.parentElement) {
            child.parentElement.removeChild(child);
        }
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    append(...nodes) {
        nodes.forEach((node) => {
            if (node instanceof FakeElement) {
                this.appendChild(node);
            }
        });
    }

    replaceChildren(...nodes) {
        this.children.forEach((child) => {
            child.parentElement = null;
        });
        this.children = [];
        this.append(...nodes);
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
            this.children.splice(index, 1);
            child.parentElement = null;
        }
        return child;
    }

    insertBefore(node, referenceNode) {
        if (node.parentElement) {
            node.parentElement.removeChild(node);
        }
        if (!referenceNode) {
            return this.appendChild(node);
        }
        const index = this.children.indexOf(referenceNode);
        if (index < 0) {
            return this.appendChild(node);
        }
        node.parentElement = this;
        this.children.splice(index, 0, node);
        return node;
    }

    contains(node) {
        if (node === this) return true;
        for (const child of this.children) {
            if (child.contains(node)) return true;
        }
        return false;
    }

    closest(selector) {
        if (!selector || !selector.startsWith(".")) return null;
        const targetClass = selector.slice(1);
        let current = this;
        while (current) {
            if (current.classList.contains(targetClass)) return current;
            current = current.parentElement;
        }
        return null;
    }

    querySelector(selector) {
        const matcher = createMatcher(selector);
        for (const child of this.children) {
            if (matcher(child)) return child;
            const nested = child.querySelector(selector);
            if (nested) return nested;
        }
        return null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    hasAttribute(name) {
        return this.attributes.has(name);
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    addEventListener(type, listener) {
        this._events.set(type, listener);
    }

    getBoundingClientRect() {
        return { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 };
    }
}

function createMatcher(selector) {
    if (selector.startsWith(".")) {
        const targetClass = selector.slice(1);
        return (el) => el.classList.contains(targetClass);
    }
    const tag = selector.toUpperCase();
    return (el) => el.tagName === tag;
}

function installFakeDom() {
    const previous = {
        document: globalThis.document,
        window: globalThis.window,
        HTMLElement: globalThis.HTMLElement,
        navigator: globalThis.navigator,
        location: globalThis.location,
        CSS: globalThis.CSS,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        IntersectionObserver: globalThis.IntersectionObserver
    };

    const body = new FakeElement("body");
    const head = new FakeElement("head");
    const document = {
        body,
        head,
        documentElement: { clientHeight: 720 },
        createElement(tagName) {
            return new FakeElement(tagName);
        },
        querySelector(selector) {
            const fromHead = head.querySelector(selector);
            if (fromHead) return fromHead;
            return body.querySelector(selector);
        }
    };

    setGlobalValue("document", document);
    setGlobalValue("window", { innerHeight: 720 });
    setGlobalValue("HTMLElement", FakeElement);
    setGlobalValue("navigator", { maxTouchPoints: 0 });
    setGlobalValue("location", { origin: "https://example.test" });
    setGlobalValue("CSS", { supports: () => false });
    setGlobalValue("requestAnimationFrame", (cb) => {
        if (typeof cb === "function") cb();
        return 0;
    });
    setGlobalValue("IntersectionObserver", class {
        observe() {}
        disconnect() {}
    });

    return () => {
        setGlobalValue("document", previous.document);
        setGlobalValue("window", previous.window);
        setGlobalValue("HTMLElement", previous.HTMLElement);
        setGlobalValue("navigator", previous.navigator);
        setGlobalValue("location", previous.location);
        setGlobalValue("CSS", previous.CSS);
        setGlobalValue("requestAnimationFrame", previous.requestAnimationFrame);
        setGlobalValue("IntersectionObserver", previous.IntersectionObserver);
    };
}

function setGlobalValue(name, value) {
    Object.defineProperty(globalThis, name, {
        value,
        configurable: true,
        writable: true
    });
}

function makeRenderRow(input) {
    return {
        sourceIndex: input.sourceIndex,
        songKey: input.songKey,
        title: input.title || "title",
        artist: input.artist || "artist",
        date: input.date || "2024-01-01",
        format: input.format || "配信",
        isRelay: false,
        isHarmony: false,
        url: input.url || "https://youtu.be/video1"
    };
}

function createDataTransferMock() {
    const store = new Map();
    return {
        effectAllowed: "none",
        setData(type, value) {
            store.set(String(type), String(value));
        },
        getData(type) {
            return store.get(String(type)) || "";
        }
    };
}

function invokeListener(element, type, event) {
    const listener = element && element._events ? element._events.get(type) : null;
    assert.equal(typeof listener, "function", `${type} listener is missing`);
    listener(event);
}

test("render: empty results stop active playback", () => {
    const cleanup = installFakeDom();
    try {
        const data = {
            currentResults: [],
            displayLimit: 48,
            activeBookmark: null
        };
        const ui = {
            activeThumb: document.createElement("div"),
            showThumbnails: false,
            scrollObserver: null,
            cardEntriesBySourceKey: new Map(),
            selectedFormats: new Set(["配信"]),
            dataReady: true,
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        };
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
        const ui = {
            activeThumb: null,
            showThumbnails: false,
            scrollObserver: null,
            cardEntriesBySourceKey: new Map(),
            selectedFormats: new Set(["配信"]),
            dataReady: true,
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        };
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
        const entry = ui.cardEntriesBySourceKey.get(`song:${row.songKey}`);
        assert.ok(entry);

        ui.activeThumb = entry.thumbDiv;
        ui.activeThumb.appendChild(document.createElement("iframe"));
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
        const ui = {
            activeThumb: null,
            showThumbnails: false,
            scrollObserver: null,
            cardEntriesBySourceKey: new Map(),
            selectedFormats: new Set(["配信"]),
            dataReady: true,
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        };
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
        const entryA = ui.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        assert.ok(entryA);
        ui.activeThumb = entryA.thumbDiv;
        ui.activeThumb.appendChild(document.createElement("iframe"));

        data.currentResults = [rowB];
        controller.updateDisplay();

        assert.equal(restoreCount, 1);
    } finally {
        cleanup();
    }
});

test("render: cards get masonry row spans while preserving DOM order", () => {
    const cleanup = installFakeDom();
    try {
        const rowA = makeRenderRow({ songKey: "a::1", sourceIndex: 1 });
        const rowB = makeRenderRow({ songKey: "b::2", sourceIndex: 2, url: "https://www.youtube.com/shorts/video2" });
        const data = {
            currentResults: [rowA, rowB],
            displayLimit: 10,
            activeBookmark: null
        };
        const ui = {
            activeThumb: null,
            showThumbnails: false,
            scrollObserver: null,
            cardEntriesBySourceKey: new Map(),
            selectedFormats: new Set(["配信"]),
            dataReady: true,
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        };
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
        const entryA = ui.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        const entryB = ui.cardEntriesBySourceKey.get(`song:${rowB.songKey}`);
        assert.equal(ui.el.resultList.children[0], entryA.card);
        assert.equal(ui.el.resultList.children[1], entryB.card);
        assert.equal(entryA.card.style.gridRowEnd, "span 7");
        assert.equal(entryB.card.style.gridRowEnd, "span 7");
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
        const ui = {
            activeThumb: null,
            showThumbnails: false,
            scrollObserver: null,
            cardEntriesBySourceKey: new Map(),
            selectedFormats: new Set(["配信"]),
            dataReady: true,
            searchDebounceId: 0,
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
        };

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
        const ui = {
            activeThumb: null,
            showThumbnails: false,
            scrollObserver: null,
            cardEntriesBySourceKey: new Map(),
            selectedFormats: new Set(["配信"]),
            dataReady: true,
            el: {
                resultList: document.createElement("div"),
                loadMoreContainer: document.createElement("div")
            }
        };
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
        const normalEntryA = ui.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        assert.ok(normalEntryA);
        assert.equal(normalEntryA.dragHandle.hidden, true);
        assert.equal(normalEntryA.dragHandle.draggable, false);
        assert.equal(normalEntryA.card.draggable, false);
        assert.equal(normalEntryA.card._events.has("dragstart"), false);

        data.activeBookmark = "bm1";
        controller.updateDisplay();
        const entryA = ui.cardEntriesBySourceKey.get(`song:${rowA.songKey}`);
        const entryB = ui.cardEntriesBySourceKey.get(`song:${rowB.songKey}`);
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

test("youtube: disconnected active thumb is cleared without restore work", () => {
    const cleanup = installFakeDom();
    try {
        const ui = {
            showThumbnails: true,
            activeThumb: document.createElement("div")
        };
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });

        controller.restoreActivePlayback();
        assert.equal(ui.activeThumb, null);
    } finally {
        cleanup();
    }
});

test("youtube: shorts url is treated as vertical playback target", () => {
    const yt = extractYoutubeInfo("https://www.youtube.com/shorts/abc123?t=45");
    assert.deepEqual(yt, { videoId: "abc123", startSeconds: 45, isVertical: true });
});

test("youtube: updateThumbnail reflects vertical orientation on thumb dataset", () => {
    const cleanup = installFakeDom();
    try {
        const ui = {
            showThumbnails: true,
            activeThumb: null
        };
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });

        const thumb = document.createElement("div");
        controller.updateThumbnail(thumb, { videoId: "short1", startSeconds: 0, isVertical: true });
        assert.equal(thumb.dataset.videoOrientation, "vertical");

        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 0, isVertical: false });
        assert.equal(thumb.dataset.videoOrientation, "landscape");
    } finally {
        cleanup();
    }
});

test("youtube: after explicit restore, same target does not auto-resume on redraw", () => {
    const cleanup = installFakeDom();
    try {
        const ui = {
            showThumbnails: true,
            activeThumb: null
        };
        const youtube = {
            apiPromise: null,
            players: new WeakMap()
        };
        const controller = createYoutubeController({
            ui,
            youtube,
            constants: {
                YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
                YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
                YT_IFRAME_READY_POLL_MS: 50,
                STOP_PLAYBACK_ON_SCROLL_OUT: false
            }
        });

        const thumb = document.createElement("div");
        document.body.appendChild(thumb);
        thumb.dataset.videoId = "video1";
        thumb.dataset.playbackKey = "video1:0";
        thumb.classList.add("playing");
        thumb.appendChild(document.createElement("iframe"));
        ui.activeThumb = thumb;

        controller.restoreActivePlayback();
        assert.equal(ui.activeThumb, null);
        assert.equal(thumb.querySelector("iframe"), null);

        controller.updateThumbnail(thumb, { videoId: "video1", startSeconds: 0 });
        assert.equal(thumb.querySelector("iframe"), null);
        assert.ok(thumb.querySelector("img"));
        assert.equal(typeof thumb.onclick, "function");
    } finally {
        cleanup();
    }
});
