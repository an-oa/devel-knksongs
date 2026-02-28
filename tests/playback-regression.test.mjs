import test from "node:test";
import assert from "node:assert/strict";
import { createRenderController } from "../render.mjs";
import { createYoutubeController } from "../youtube.mjs";

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
