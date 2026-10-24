import test from "node:test";
import assert from "node:assert/strict";
import { getSongDisplayArtist, getSongDisplayTitle } from "../app/lib/song-display-name.mts";

test("song display names: English names are chosen only for the English site", () => {
    const song = { title: "アイネクライネ", titleEn: "Eine Kleine", artist: "米津玄師", artistEn: "Kenshi Yonezu" };

    assert.deepEqual(getSongDisplayTitle(song, "en"), { text: "Eine Kleine", lang: "en" });
    assert.deepEqual(getSongDisplayArtist(song, "en"), { text: "Kenshi Yonezu", lang: "en" });
    assert.deepEqual(getSongDisplayTitle(song, "ja"), { text: "アイネクライネ", lang: "ja" });
    assert.deepEqual(getSongDisplayArtist(song, "ja"), { text: "米津玄師", lang: "ja" });
});

test("song display names: songs without English names keep the Japanese names", () => {
    const song = { title: "曲", titleEn: "", artist: "歌手", artistEn: "  " };

    assert.deepEqual(getSongDisplayTitle(song, "en"), { text: "曲", lang: "ja" });
    assert.deepEqual(getSongDisplayArtist(song, "en"), { text: "歌手", lang: "ja" });
});

test("song display names: English names keep the sheet text as is", () => {
    const song = { title: "マトリョシカ", titleEn: "Matryoshka", artist: "ハチ feat. 初音ミク,GUMI", artistEn: "Hachi feat. Miku Hatsune,GUMI" };

    assert.equal(getSongDisplayArtist(song, "en").text, "Hachi feat. Miku Hatsune,GUMI");
});
