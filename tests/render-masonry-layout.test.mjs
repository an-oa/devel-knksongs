import test from "node:test";
import assert from "node:assert/strict";
import {
    applyMasonryLayout,
    getMasonryColumnCount
} from "../app/lib/render/masonry-layout.mjs";
import { installFakeDom } from "./test-helpers.mjs";

test("render masonry: column count follows breakpoints", () => {
    assert.equal(getMasonryColumnCount(1500), 4);
    assert.equal(getMasonryColumnCount(1000), 3);
    assert.equal(getMasonryColumnCount(600), 2);
    assert.equal(getMasonryColumnCount(599), 1);
});

test("render masonry: applies fixed columns and container height", () => {
    const cleanup = installFakeDom();
    try {
        const container = document.createElement("div");
        container._clientWidth = 224;
        const cards = Array.from({ length: 3 }, () => document.createElement("div"));
        cards.forEach((card, index) => {
            card.className = "song-card";
            card._scrollHeight = [100, 80, 40][index];
            container.appendChild(card);
        });

        applyMasonryLayout(container, {
            gapPx: 12,
            breakpoints: [{ minWidth: 200, columns: 2 }]
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
