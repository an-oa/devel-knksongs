import assert from "node:assert/strict";
import { createSongFixture } from "./fixtures/song.mts";

// 実際にテストで渡すイベントの部分形。ブラウザの Event 全体は実装しない。
type FakeEvent = {
    target?: FakeElement | EventTarget | null;
    currentTarget?: FakeElement | EventTarget | null;
    relatedTarget?: FakeElement | EventTarget | null;
    key?: string;
    shiftKey?: boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
    dataTransfer?: ReturnType<typeof createDataTransferMock>;
};

type FakeTimeout = {
    cb: () => void;
    delay: number | undefined;
    cleared: boolean;
    unrefCalled: boolean;
    unref: () => void;
};

class FakeClassList {
    values = new Set<string>();

    /** 指定されたクラス名を追加する。 */
    add(...tokens: string[]) {
        tokens.forEach((token) => {
            if (token) this.values.add(token);
        });
    }

    /** 指定されたクラス名を取り除く。 */
    remove(...tokens: string[]) {
        tokens.forEach((token) => this.values.delete(token));
    }

    /** クラス名の有無を返す。 */
    contains(token: string) {
        return this.values.has(token);
    }

    /** クラス名の有無を切り替え、変更後の状態を返す。 */
    toggle(token: string, force?: boolean) {
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

    /** クラス名を空白区切りで返す。 */
    toString() {
        return Array.from(this.values).join(" ");
    }
}

// 必要な DOM 操作だけを持つモック。HTMLElement としての完全な実装ではない。
class FakeElement {
    tagName: string;
    dataset: Record<string, string | undefined> = {};
    children: FakeElement[] = [];
    parentElement: FakeElement | null = null;
    classList = new FakeClassList();
    style: Partial<CSSStyleDeclaration> = {};
    attributes = new Map<string, string>();
    onclick: ((event: FakeEvent) => void) | null = null;
    textContent = "";
    _innerHTML = "";
    hidden = false;
    type = "";
    _events = new Map<string, (event: FakeEvent) => void>();
    _scrollHeight?: number;
    _clientHeight?: number;
    _clientWidth?: number;
    _rect?: Pick<DOMRectReadOnly, "top" | "bottom" | "left" | "right" | "width" | "height">;

    constructor(tagName = "div") {
        this.tagName = String(tagName).toUpperCase();
    }

    get className() {
        return this.classList.toString();
    }

    set className(value: string) {
        this.classList = new FakeClassList();
        String(value || "")
            .split(/\s+/)
            .filter(Boolean)
            .forEach((token) => this.classList.add(token));
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(value: string) {
        this._innerHTML = String(value || "");
        this.children.forEach((child) => {
            child.parentElement = null;
        });
        this.children = [];
        this.textContent = "";
        parseSimpleInnerHtml(this, this._innerHTML);
    }

    get firstChild() {
        return this.children[0] || null;
    }

    get childElementCount() {
        return this.children.length;
    }

    get lastElementChild() {
        return this.children[this.children.length - 1] || null;
    }

    get nextSibling(): FakeElement | null {
        if (!this.parentElement) return null;
        const siblings = this.parentElement.children;
        const index = siblings.indexOf(this);
        if (index < 0) return null;
        return siblings[index + 1] || null;
    }

    get isConnected(): boolean {
        const body = getInstalledFakeDocument()?.body;
        if (!body) return false;
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- 自身から祖先をたどるための走査位置。
        let node: FakeElement | null = this;
        while (node) {
            if (node === body) return true;
            node = node.parentElement;
        }
        return false;
    }

    get scrollHeight() {
        if (typeof this._scrollHeight === "number") return this._scrollHeight;
        return 100;
    }

    get clientHeight() {
        if (typeof this._clientHeight === "number") return this._clientHeight;
        return 100;
    }

    get clientWidth() {
        if (typeof this._clientWidth === "number") return this._clientWidth;
        return 100;
    }

    /** 親を付け替えて子要素を追加し、fragment はその子を展開する。 */
    appendChild<T extends FakeElement>(child: T): T {
        if (child instanceof FakeDocumentFragment) {
            child.children.slice().forEach((fragmentChild) => {
                this.appendChild(fragmentChild);
            });
            return child;
        }
        if (child.parentElement) {
            child.parentElement.removeChild(child);
        }
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    /** モック要素だけを末尾へ追加する。 */
    append(...nodes: (FakeElement | string)[]) {
        nodes.forEach((node) => {
            if (node instanceof FakeElement) {
                this.appendChild(node);
            }
        });
    }

    /** 既存の子要素を外して指定された要素へ置き換える。 */
    replaceChildren(...nodes: (FakeElement | string)[]) {
        this.children.forEach((child) => {
            child.parentElement = null;
        });
        this.children = [];
        this.append(...nodes);
    }

    /** 子要素を取り除き、その親参照を解除する。 */
    removeChild<T extends FakeElement>(child: T): T {
        const index = this.children.indexOf(child);
        if (index >= 0) {
            this.children.splice(index, 1);
            child.parentElement = null;
        }
        return child;
    }

    /** 指定した子の直前、または末尾に要素を移動する。 */
    insertBefore<T extends FakeElement>(node: T, referenceNode: FakeElement | null): T {
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

    /** 自身または子孫に指定された要素があるか返す。 */
    contains(node: unknown): boolean {
        if (node === this) return true;
        for (const child of this.children) {
            if (child.contains(node)) return true;
        }
        return false;
    }

    /** クラス名が一致する自身または祖先を返す。 */
    closest(selector: string): FakeElement | null {
        if (!selector || !selector.startsWith(".")) return null;
        const targetClass = selector.slice(1);
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- 自身から祖先をたどるための走査位置。
        let current: FakeElement | null = this;
        while (current) {
            if (current.classList.contains(targetClass)) return current;
            current = current.parentElement;
        }
        return null;
    }

    /** セレクターが一致する最初の子孫を返す。 */
    querySelector(selector: string): FakeElement | null {
        const matcher = createMatcher(selector);
        for (const child of this.children) {
            if (matcher(child)) return child;
            const nested = child.querySelector(selector);
            if (nested) return nested;
        }
        return null;
    }

    /** セレクターが一致する子孫を配列で返す。 */
    querySelectorAll(selector: string): FakeElement[] {
        const matcher = createMatcher(selector);
        const matches: FakeElement[] = [];
        for (const child of this.children) {
            if (matcher(child)) matches.push(child);
            matches.push(...child.querySelectorAll(selector));
        }
        return matches;
    }

    /** 属性値を文字列として記録する。 */
    setAttribute(name: string, value: unknown) {
        this.attributes.set(name, String(value));
    }

    /** 記録済みの属性値を返す。 */
    getAttribute(name: string) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    /** 属性が記録されているか返す。 */
    hasAttribute(name: string) {
        return this.attributes.has(name);
    }

    /** 記録済みの属性を削除する。 */
    removeAttribute(name: string) {
        this.attributes.delete(name);
    }

    /** イベント種別ごとに最後に登録された listener を記録する。 */
    addEventListener(type: string, listener: (event: FakeEvent) => void) {
        this._events.set(type, listener);
    }

    /** 記録されたクリック listener と onclick を呼ぶ。 */
    click() {
        const event = {
            target: this,
            currentTarget: this,
            preventDefault() {},
            stopPropagation() {}
        };
        const listener = this._events.get("click");
        if (typeof listener === "function") {
            listener(event);
        }
        if (typeof this.onclick === "function") {
            this.onclick(event);
        }
    }

    /** グローバルに設置したモック document のフォーカスを更新する。 */
    focus(): void {
        const document = getInstalledFakeDocument();
        if (document) {
            document.activeElement = this;
        }
    }

    /** 自身がフォーカスされている場合だけ解除する。 */
    blur(): void {
        const document = getInstalledFakeDocument();
        if (document && document.activeElement === this) {
            document.activeElement = null;
        }
    }

    /** テスト指定の矩形、または既定の矩形を返す。 */
    getBoundingClientRect() {
        if (this._rect) return this._rect;
        return { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 };
    }
}

class FakeDocumentFragment extends FakeElement {
    constructor() {
        super("#fragment");
    }
}

/**
 * installFakeDom が設置した document を取得し、モック内部の型境界をここに集める。
 * body がモック要素である場合だけ返し、cleanup 後の実 DOM は操作しない。
 */
function getInstalledFakeDocument() {
    const document = globalThis.document as unknown as ReturnType<typeof installFakeDom>["document"] | undefined;
    return document?.body instanceof FakeElement ? document : undefined;
}

/** 属性の id が一致する要素を部分木から探す。 */
function findElementById(root: FakeElement | null, id: string): FakeElement | null {
    if (!root) return null;
    if (root.getAttribute && root.getAttribute("id") === id) return root;
    for (const child of root.children || []) {
        const found = findElementById(child, id);
        if (found) return found;
    }
    return null;
}

/** テストで使うクラス・タグ・属性セレクターの判定を作る。 */
function createMatcher(selector: string): (element: FakeElement) => boolean {
    if (selector.startsWith(".")) {
        const targetClass = selector.slice(1);
        return (el) => el.classList.contains(targetClass);
    }
    const attrSelector = selector.match(/^([a-zA-Z0-9-]+)\[([a-zA-Z0-9:-]+)="([^"]*)"\]$/);
    if (attrSelector) {
        const [, tagName, attrName, attrValue] = attrSelector;
        const tag = tagName.toUpperCase();
        return (el) => el.tagName === tag && (Reflect.get(el, attrName) === attrValue || el.getAttribute(attrName) === attrValue);
    }
    const tag = selector.toUpperCase();
    return (el) => el.tagName === tag;
}

/** テスト用の単純な HTML をモック要素の木へ変換する。 */
function parseSimpleInnerHtml(root: FakeElement, html: string) {
    const source = String(html || "");
    if (!source.trim()) return;
    const tokenPattern = /<\/?([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
    const stack = [root];
    let match;

    while ((match = tokenPattern.exec(source))) {
        const [, tagName, attrs, text] = match;
        const current = stack[stack.length - 1];
        if (!current) break;

        if (text) {
            const decoded = text.replace(/&times;/g, "×");
            if (decoded.trim()) {
                current.textContent += decoded.trim();
            }
            continue;
        }

        if (match[0].startsWith("</")) {
            if (stack.length > 1) stack.pop();
            continue;
        }

        const element = new FakeElement(tagName);
        const attrPattern = /([a-zA-Z0-9:-]+)="([^"]*)"/g;
        let attrMatch;
        while ((attrMatch = attrPattern.exec(attrs || ""))) {
            const [, name, attrValue] = attrMatch;
            if (name === "class") {
                element.className = attrValue;
            } else {
                element.setAttribute(name, attrValue);
            }
        }
        current.appendChild(element);
        if (!match[0].endsWith("/>")) {
            stack.push(element);
        }
    }
}

/**
 * DOM の部分実装をグローバルに設置する。
 * 戻り値は従来どおり cleanup として呼べ、document/window でモック固有の値も操作できる。
 */
export function installFakeDom() {
    const previous = {
        document: globalThis.document,
        window: globalThis.window,
        Element: globalThis.Element,
        HTMLElement: globalThis.HTMLElement,
        navigator: globalThis.navigator,
        location: globalThis.location,
        CSS: globalThis.CSS,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        IntersectionObserver: globalThis.IntersectionObserver
    };

    const body = new FakeElement("body");
    const head = new FakeElement("head");
    const documentElement = new FakeElement("html");
    documentElement._clientHeight = 720;
    const document = {
        body,
        head,
        scrollingElement: body,
        documentElement,
        activeElement: null as FakeElement | null,
        _events: new Map<string, (event: FakeEvent) => void>(),
        /** 指定されたタグのモック要素を作る。 */
        createElement(tagName: string) {
            return new FakeElement(tagName);
        },
        /** 子要素をまとめて移動する fragment を作る。 */
        createDocumentFragment() {
            return new FakeDocumentFragment();
        },
        /** document 全体の一覧検索は従来どおり空配列を返す。 */
        querySelectorAll(): FakeElement[] {
            return [];
        },
        /** セレクターが一致する最初の子孫を返す。 */
        querySelector(selector: string): FakeElement | null {
            const fromHead = head.querySelector(selector);
            if (fromHead) return fromHead;
            return body.querySelector(selector);
        },
        /** head と body から id が一致する要素を探す。 */
        getElementById(id: string) {
            return findElementById(head, id) || findElementById(body, id);
        },
        /** イベント種別ごとに最後に登録された listener を記録する。 */
        addEventListener(type: string, listener: (event: FakeEvent) => void) {
            this._events.set(type, listener);
        }
    };

    setGlobalValue("document", document);
    const window = {
        innerHeight: 720 as number | undefined,
        scrollBy() {},
        matchMedia() {
            return { matches: false };
        },
        getComputedStyle() {
            return { overflowY: "visible" };
        },
        _events: new Map<string, (event: FakeEvent) => void>(),
        /** イベント種別ごとに最後に登録された listener を記録する。 */
        addEventListener(type: string, listener: (event: FakeEvent) => void) {
            this._events.set(type, listener);
        }
    };
    setGlobalValue("window", window);
    setGlobalValue("Element", FakeElement);
    setGlobalValue("HTMLElement", FakeElement);
    setGlobalValue("navigator", { maxTouchPoints: 0 });
    setGlobalValue("location", { origin: "https://example.test" });
    setGlobalValue("CSS", { supports: () => false });
    setGlobalValue("requestAnimationFrame", (cb: () => void) => {
        if (typeof cb === "function") cb();
        return 0;
    });
    setGlobalValue("IntersectionObserver", class {
        observe() {}
        disconnect() {}
    });

    /** 設置前のグローバル値へ戻す。 */
    const cleanup = () => {
        setGlobalValue("document", previous.document);
        setGlobalValue("window", previous.window);
        setGlobalValue("Element", previous.Element);
        setGlobalValue("HTMLElement", previous.HTMLElement);
        setGlobalValue("navigator", previous.navigator);
        setGlobalValue("location", previous.location);
        setGlobalValue("CSS", previous.CSS);
        setGlobalValue("requestAnimationFrame", previous.requestAnimationFrame);
        setGlobalValue("IntersectionObserver", previous.IntersectionObserver);
    };
    return Object.assign(cleanup, { document, window });
}

/** 部分実装のモックをグローバルへ設置する境界。DOM 全体の型とは混同しない。 */
export function setGlobalValue(name: PropertyKey, value: unknown) {
    Object.defineProperty(globalThis, name, {
        value,
        configurable: true,
        writable: true
    });
}

/** 描画用の既定値を保ち、共有 fixture で完全な Song を作る。 */
export function makeRenderRow(input: Pick<Song, "songKey"> & Partial<Pick<Song,
    "bookmarkSongKey" | "title" | "artist" | "date" | "format" | "streamRole" | "videoOrientation" | "url"
>>): Song {
    return createSongFixture({
        songKey: input.songKey,
        bookmarkSongKey: input.bookmarkSongKey ?? input.songKey,
        title: input.title || "title",
        artist: input.artist || "artist",
        date: input.date || "2024-01-01",
        format: input.format || "配信",
        streamRole: input.streamRole ?? "",
        videoOrientation: input.videoOrientation || "",
        isRelay: false,
        isHarmony: false,
        url: input.url || "https://youtu.be/video1",
        // 描画用の曲には従来どおり再生終了時刻を指定しない。
        endSeconds: null
    });
}

/** ドラッグ操作で受け渡す文字列を記録する。 */
export function createDataTransferMock() {
    const store = new Map<string, string>();
    return {
        effectAllowed: "none",
        /** 種別ごとのデータを文字列として記録する。 */
        setData(type: string, value: string) {
            store.set(String(type), String(value));
        },
        /** 記録済みデータ、または空文字列を返す。 */
        getData(type: string) {
            return store.get(String(type)) || "";
        }
    };
}

/** listener の存在を確認して呼び、非同期 handler の完了も待てるよう戻り値を返す。 */
export function invokeListener(
    element: Element | { _events?: ReadonlyMap<string, (event: FakeEvent) => void | Promise<void>> } | null | undefined,
    type: string,
    event: FakeEvent
) {
    const listener = element && "_events" in element ? element._events?.get(type) : null;
    assert.ok(typeof listener === "function", `${type} listener is missing`);
    return listener(event);
}

/** setTimeout/clearTimeout を記録型 fake に差し替える。 */
export function installFakeTimeouts() {
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const timeoutCalls: FakeTimeout[] = [];
    setGlobalValue("setTimeout", (cb: () => void, delay?: number) => {
        const timeout = {
            cb,
            delay,
            cleared: false,
            unrefCalled: false,
            /** Node 互換の参照解除が呼ばれたことを記録する。 */
            unref() { this.unrefCalled = true; }
        };
        timeoutCalls.push(timeout);
        return timeout;
    });
    setGlobalValue("clearTimeout", (timeout: FakeTimeout | null | undefined) => {
        if (timeout) timeout.cleared = true;
    });
    return {
        timeoutCalls,
        /** 元のタイマー関数に戻す。 */
        cleanup() {
            setGlobalValue("setTimeout", previousSetTimeout);
            setGlobalValue("clearTimeout", previousClearTimeout);
        }
    };
}
