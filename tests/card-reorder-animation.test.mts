import test from "node:test";
import assert from "node:assert/strict";
import { animateCardReorder, captureCardPositions } from "../app/lib/render/card-reorder-animation.mts";
import { getFakeElement, installFakeDom } from "./test-helpers.mts";

type AnimationCall = {
    songKey: string;
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null;
    options: number | KeyframeAnimationOptions | undefined;
};

/**
 * カードの上端の位置を、高さ 100px のまま変える。
 * @param card 結果カード
 * @param top 新しい上端の位置
 */
function setCardTop(card: HTMLElement, top: number) {
    getFakeElement(card)._rect = { top, bottom: top + 100, left: 0, right: 300, width: 300, height: 100 };
}

/**
 * 曲キーと位置を持つ結果カードを、一覧の末尾に足す。
 * @param list 結果カードを並べた一覧
 * @param songKey カードの曲キー
 * @param top カードの上端の位置
 */
function appendCard(list: HTMLElement, songKey: string, top: number) {
    const card = document.createElement("div");
    card.className = "song-card";
    card.dataset.songKey = songKey;
    setCardTop(card, top);
    list.appendChild(card);
    return card;
}

/**
 * カードの animate と getAnimations を、呼び出しを記録するモックに差し替える。
 * @param card 結果カード
 * @param calls animate の呼び出しを記録する配列
 * @param running getAnimations が返す、動いているアニメーション
 */
function mockCardAnimations(card: HTMLElement, calls: AnimationCall[], running: Animation[] = []) {
    card.animate = (keyframes, options) => {
        calls.push({ songKey: card.dataset.songKey ?? "", keyframes, options });
        return { id: "", cancel() {} } as unknown as Animation;
    };
    card.getAnimations = () => running;
}

test("card reorder animation: slides moved cards from their previous positions and lifts the moved card", () => {
    const cleanup = installFakeDom();
    try {
        const list = document.createElement("div");
        const cards = [appendCard(list, "a", 0), appendCard(list, "b", 110), appendCard(list, "c", 220), appendCard(list, "d", 330)];
        const calls: AnimationCall[] = [];
        cards.forEach((card) => mockCardAnimations(card, calls));
        const positions = captureCardPositions(list);

        // a を c の位置へ移すと、b と c が 1 枠ずつ上がる。d は動かない。
        const [a, b, c] = cards;
        setCardTop(b, 0);
        setCardTop(c, 110);
        setCardTop(a, 220);
        animateCardReorder(list, positions, "a");

        assert.deepEqual(calls.map((call) => [call.songKey, call.keyframes]), [
            ["a", [{ transform: "translate(0px, -220px)", zIndex: 3 }, { transform: "none", zIndex: 3 }]],
            ["b", [{ transform: "translate(0px, 110px)" }, { transform: "none" }]],
            ["c", [{ transform: "translate(0px, 110px)" }, { transform: "none" }]]
        ]);
        assert.deepEqual(calls[0].options, { duration: 250, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    } finally {
        cleanup();
    }
});

test("card reorder animation: moves nothing when reduced motion is preferred", () => {
    const cleanup = installFakeDom();
    try {
        window.matchMedia = (query) => ({ matches: query === "(prefers-reduced-motion: reduce)" }) as unknown as MediaQueryList;
        const list = document.createElement("div");
        const a = appendCard(list, "a", 0);
        const b = appendCard(list, "b", 110);
        const calls: AnimationCall[] = [];
        [a, b].forEach((card) => mockCardAnimations(card, calls));
        const positions = captureCardPositions(list);

        setCardTop(b, 0);
        setCardTop(a, 110);
        animateCardReorder(list, positions, "a");

        assert.deepEqual(calls, []);
    } finally {
        cleanup();
    }
});

test("card reorder animation: stops a running slide before measuring the new positions", () => {
    const cleanup = installFakeDom();
    try {
        const list = document.createElement("div");
        const a = appendCard(list, "a", 0);
        const cancelled: string[] = [];
        const running = [
            { id: "card-reorder", cancel() { cancelled.push("card-reorder"); } },
            { id: "other", cancel() { cancelled.push("other"); } }
        ] as unknown as Animation[];
        mockCardAnimations(a, [], running);
        const positions = captureCardPositions(list);

        animateCardReorder(list, positions, "a");

        assert.deepEqual(cancelled, ["card-reorder"]);
    } finally {
        cleanup();
    }
});
