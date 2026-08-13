import test from "node:test";
import assert from "node:assert/strict";
import { pickRecommendedSongs } from "../_build/app/lib/search-recommendation.mjs";
import { normalizeForSearch } from "../_build/app/lib/search-normalization.mjs";

let autoSongId = 0;

function makeRow(input) {
    const title = input.title ?? "";
    const artist = input.artist ?? "";
    const titleYomi = input.titleYomi ?? "";
    const artistYomi = input.artistYomi ?? "";
    const songKey = input.songKey ?? `song-${++autoSongId}`;
    return {
        archiveId: input.archiveId ?? "",
        archiveOrder: input.archiveOrder ?? null,
        songKey,
        bookmarkSongKey: input.bookmarkSongKey ?? songKey,
        sourceIndex: input.sourceIndex ?? 0,
        dateKey: input.dateKey ?? null,
        format: input.format ?? "配信",
        streamRole: input.streamRole ?? "",
        isRelay: !!input.isRelay,
        isHarmony: !!input.isHarmony,
        titleNorm: normalizeForSearch(title),
        artistNorm: normalizeForSearch(artist),
        titleYomiNorm: normalizeForSearch(titleYomi),
        artistYomiNorm: normalizeForSearch(artistYomi)
    };
}

test("pickRecommendedSongs: prefers 歌みた rows over 配信 and ショート for the same song", () => {
    const rows = [
        makeRow({ archiveId: "a1", sourceIndex: 1, title: "群青", artist: "A", format: "配信" }),
        makeRow({ archiveId: "a2", sourceIndex: 2, title: "群青", artist: "A", format: "ショート" }),
        makeRow({ archiveId: "a3", sourceIndex: 3, title: "群青", artist: "A", format: "歌みた" })
    ];

    const picked = pickRecommendedSongs(rows, { count: 10, minPerformanceCount: 2 });

    assert.equal(picked.length, 1);
    assert.equal(picked[0].format, "歌みた");
});

test("pickRecommendedSongs: excludes ゲスト rows from recommendation candidates", () => {
    const rows = [
        makeRow({ archiveId: "a1", sourceIndex: 1, title: "群青", artist: "A", format: "配信", streamRole: "ゲスト" }),
        makeRow({ archiveId: "a2", sourceIndex: 2, title: "群青", artist: "A", format: "配信", streamRole: "ゲスト" }),
        makeRow({ archiveId: "a3", sourceIndex: 3, title: "群青", artist: "A", format: "配信", streamRole: "ゲスト" }),
        makeRow({ archiveId: "a4", sourceIndex: 4, title: "青空", artist: "B", format: "配信" }),
        makeRow({ archiveId: "a5", sourceIndex: 5, title: "青空", artist: "B", format: "配信" })
    ];

    const picked = pickRecommendedSongs(rows, { count: 10, minPerformanceCount: 2 });

    assert.equal(picked.length, 1);
    assert.equal(picked[0].titleNorm, normalizeForSearch("青空"));
    assert.notEqual(picked[0].streamRole, "ゲスト");
});

test("pickRecommendedSongs: keeps the latest row within the same archive", () => {
    const rows = [
        makeRow({ archiveId: "a1", archiveOrder: 1, sourceIndex: 1, title: "群青", artist: "A", format: "配信" }),
        makeRow({ archiveId: "a1", archiveOrder: 2, sourceIndex: 2, title: "群青", artist: "A", format: "配信" }),
        makeRow({ archiveId: "a2", archiveOrder: 1, sourceIndex: 3, title: "群青", artist: "A", format: "配信" })
    ];
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
        const picked = pickRecommendedSongs(rows, { count: 10, minPerformanceCount: 2 });

        assert.equal(picked.length, 1);
        assert.equal(picked[0].archiveId, "a1");
        assert.equal(picked[0].archiveOrder, 2);
        assert.equal(picked[0].sourceIndex, 2);
    } finally {
        Math.random = originalRandom;
    }
});
