import test from "node:test";
import assert from "node:assert/strict";
import {
    applyMasonryLayout,
    countSongCardsScrolledPast,
    countSongCardsToKeep,
    estimateInitialResultDisplayCount,
    estimateMasonryVisibleCardCount,
    getMasonryColumnCount
} from "../app/lib/render/masonry-layout.mts";
import { getFakeElement, installFakeDom, setGlobalValue } from "./test-helpers.mts";

test("render masonry: column count follows available width and minimum card width", () => {
    assert.equal(getMasonryColumnCount(1920), 6);
    assert.equal(getMasonryColumnCount(1400), 4);
    assert.equal(getMasonryColumnCount(1000), 3);
    assert.equal(getMasonryColumnCount(600), 2);
    assert.equal(getMasonryColumnCount(305), 1);
    assert.equal(getMasonryColumnCount(0), 1);
});

test("render masonry: one column uses natural height and clears previous absolute placement", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        getFakeElement(container)._clientWidth = 700;
        const cards = [100, 200, 80].map((height) => {
            const card = document.createElement("div");
            card.className = "song-card";
            getFakeElement(card)._scrollHeight = height;
            container.appendChild(card);
            return card;
        });
        applyMasonryLayout(container);
        assert.equal(container.dataset.layoutColumns, "2");
        assert.equal(container.style.height, "200px");

        getFakeElement(container)._clientWidth = 350;
        for (const card of cards) {
            Object.defineProperty(card, "scrollHeight", {
                configurable: true,
                get() { throw new Error("single-column cards must not be measured"); }
            });
        }
        applyMasonryLayout(container);
        assert.equal(container.dataset.layoutColumns, "1");
        assert.equal(container.style.height, "");
        for (const card of cards) {
            assert.equal(card.style.width, "");
            assert.equal(card.style.top, "");
            assert.equal(card.style.left, "");
            assert.equal(card.style.transform, "");
            assert.equal(card.dataset.layoutColumn, "0");
            Reflect.deleteProperty(card, "scrollHeight");
        }

        getFakeElement(container)._clientWidth = 700;
        applyMasonryLayout(container);
        assert.equal(container.dataset.layoutColumns, "2");
        assert.equal(container.style.height, "200px");
        assert.equal(cards[2].style.top, "112px");
    } finally {
        cleanup();
    }
});

test("render masonry: measures all new widths before writing any card positions", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        getFakeElement(container)._clientWidth = 700;
        const cards = Array.from({ length: 3 }, () => {
            const card = document.createElement("div");
            card.className = "song-card";
            container.appendChild(card);
            return card;
        });
        let reads = 0;
        cards.forEach((card) => Object.defineProperty(card, "scrollHeight", {
            get() {
                reads += 1;
                assert.ok(cards.every((node) => node.style.width === "344px"));
                assert.ok(cards.every((node) => !node.style.top), "no position writes between height reads");
                return 100;
            }
        }));
        applyMasonryLayout(container);
        assert.equal(reads, cards.length);
        assert.equal(cards[2].style.top, "112px");
    } finally {
        cleanup();
    }
});

test("render masonry: initial single-column count follows height and thumbnail visibility", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        getFakeElement(container)._clientWidth = 350;
        getFakeElement(container)._rect = { top: 100, bottom: 100, left: 0, right: 350, width: 350, height: 0 };
        const options = { defaultCount: 48, showThumbnails: false, viewportHeight: 850 };
        // (850 * 2 - 100) / (既定のカード内容 97px + gap 12px) を切り上げる。
        assert.equal(estimateInitialResultDisplayCount(container, options), 15);
        assert.equal(estimateInitialResultDisplayCount(container, { ...options, showThumbnails: true }), 12);
        assert.equal(estimateInitialResultDisplayCount(container, { ...options, viewportHeight: 3000 }), 48);
        assert.equal(estimateInitialResultDisplayCount(container, { ...options, viewportHeight: 0 }), 48);
        assert.equal(estimateInitialResultDisplayCount(container, { ...options, defaultCount: 5 }), 5);
        assert.equal(estimateInitialResultDisplayCount(null, options), 48);
        getFakeElement(container)._clientWidth = 700;
        assert.equal(estimateInitialResultDisplayCount(container, options), 48);
    } finally {
        cleanup();
    }
});

test("render masonry: applies fixed columns and container height", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        getFakeElement(container)._clientWidth = 224;
        const cards = Array.from({ length: 3 }, () => document.createElement("div"));
        cards.forEach((card, index) => {
            card.className = "song-card";
            getFakeElement(card)._scrollHeight = [100, 80, 40][index];
            container.appendChild(card);
        });

        applyMasonryLayout(container, {
            gapPx: 12,
            minCardWidthPx: 100
        });

        assert.equal(cards[0].style.width, "106px");
        assert.equal(cards[1].style.left, "118px");
        assert.equal(cards[2].style.top, "112px");
        assert.equal(cards[2].dataset.layoutColumn, "0");
        assert.equal(container.style.height, "152px");
    } finally {
        cleanup();
    }
});

test("render masonry: reads layout metrics from CSS custom properties", () => {
    const cleanup = installFakeDom();
    const previousGetComputedStyle = globalThis.getComputedStyle;
    try {
        setGlobalValue("getComputedStyle", () => ({
            getPropertyValue(name: string) {
                const values: Record<string, string> = {
                    "--masonry-gap": "12px",
                    "--masonry-min-card-width": "100px",
                    "--masonry-card-content-estimate": "40px"
                };
                return values[name] || "";
            }
        }));
        const container = document.createElement("div");
        getFakeElement(container)._clientWidth = 224;
        getFakeElement(container)._rect = { top: 100, bottom: 200, left: 0, right: 224, width: 224, height: 100 };
        const cards = Array.from({ length: 2 }, () => document.createElement("div"));
        cards.forEach((card) => {
            card.className = "song-card";
            getFakeElement(card)._scrollHeight = 50;
            container.appendChild(card);
        });

        applyMasonryLayout(container);

        assert.equal(cards[0].style.width, "106px");
        assert.equal(cards[1].style.left, "118px");
        assert.equal(estimateMasonryVisibleCardCount(container, {
            minItemCount: 0,
            viewportHeight: 210
        }), 4);
    } finally {
        setGlobalValue("getComputedStyle", previousGetComputedStyle);
        cleanup();
    }
});

test("render masonry: estimated visible count expands beyond the minimum for tall viewports", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        getFakeElement(container)._clientWidth = 3840;
        getFakeElement(container)._rect = { top: 100, bottom: 200, left: 0, right: 3840, width: 3840, height: 100 };

        assert.equal(estimateMasonryVisibleCardCount(container, {
            minItemCount: 48,
            viewportHeight: 2100
        }), 96);

        getFakeElement(container)._clientWidth = 1920;
        getFakeElement(container)._rect = { top: 100, bottom: 200, left: 0, right: 1920, width: 1920, height: 100 };

        assert.equal(estimateMasonryVisibleCardCount(container, {
            minItemCount: 48,
            viewportHeight: 900
        }), 48);
        assert.equal(estimateMasonryVisibleCardCount(null, { minItemCount: 48 }), 48);
    } finally {
        cleanup();
    }
});

test("render masonry: counts song cards scrolled past the top of the viewport", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        const bottoms = [-300, -10, 0, 40, -5, 300];
        bottoms.forEach((bottom) => {
            const card = document.createElement("div");
            card.className = "song-card";
            getFakeElement(card)._rect = { top: bottom - 100, bottom, left: 0, right: 100, width: 100, height: 100 };
            container.appendChild(card);
        });
        const sentinel = document.createElement("div");
        getFakeElement(sentinel)._rect = { top: -200, bottom: -100, left: 0, right: 100, width: 100, height: 100 };
        container.insertBefore(sentinel, container.firstChild);

        assert.equal(countSongCardsScrolledPast(container), 3);

        Array.from(container.querySelectorAll(".song-card")).forEach((card) => {
            getFakeElement(card)._rect = { top: -200, bottom: -100, left: 0, right: 100, width: 100, height: 100 };
        });
        assert.equal(countSongCardsScrolledPast(container), 6);
        assert.equal(countSongCardsScrolledPast(null), 0);
    } finally {
        cleanup();
    }
});

test("render masonry: counts cards to keep through the last fully visible card and the required card", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        // ページの先頭では、下端が 800 以内のカード（-300・100・700 の 3 枚）と、指定したカードまでを残す。
        // 750 のカードは画面の下端で途切れる。
        const tops = [-300, 900, 100, 1200, 700, 750];
        const cards = tops.map((top) => {
            const card = document.createElement("div");
            card.className = "song-card";
            getFakeElement(card)._rect = { top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100 };
            container.appendChild(card);
            return card;
        });
        const playingThumb = document.createElement("div");
        cards[3].appendChild(playingThumb);

        assert.equal(countSongCardsToKeep(container, { viewportHeight: 800 }), 5);
        getFakeElement(cards[4])._rect = { top: 1300, bottom: 1400, left: 0, right: 100, width: 100, height: 100 };
        assert.equal(countSongCardsToKeep(container, { viewportHeight: 800 }), 3);
        assert.equal(countSongCardsToKeep(container, { viewportHeight: 800, requiredElement: playingThumb }), 4);
        assert.equal(countSongCardsToKeep(container, {
            viewportHeight: 800,
            requiredElement: document.createElement("div")
        }), 3);
        assert.equal(countSongCardsToKeep(null), 0);

        // スクロールしているときは、下端で途切れた 750 のカードも残す。
        Object.assign(getFakeElement(document.body), { scrollTop: 120 });
        document.body.appendChild(container);
        assert.equal(countSongCardsToKeep(container, { viewportHeight: 800 }), 6);
    } finally {
        cleanup();
    }
});
