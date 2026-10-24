import test from "node:test";
import assert from "node:assert/strict";
import {
    getSongDisplayArtist,
    getSongDisplayTitle,
    resolveSongNameLanguage
} from "../app/lib/song-display-name.mts";

test("resolveSongNameLanguage: a saved choice wins over the browser language", () => {
    assert.equal(resolveSongNameLanguage("en", ["ja-JP"]), "en");
    assert.equal(resolveSongNameLanguage("ja", ["en-US"]), "ja");
});

test("resolveSongNameLanguage: without a saved choice, only Japanese browsers start with Japanese names", () => {
    assert.equal(resolveSongNameLanguage(null, ["ja-JP", "en-US"]), "ja");
    assert.equal(resolveSongNameLanguage(null, ["ja"]), "ja");
    assert.equal(resolveSongNameLanguage(null, ["en-US", "ja-JP"]), "en");
    assert.equal(resolveSongNameLanguage(null, ["zh-TW"]), "en");
    assert.equal(resolveSongNameLanguage("EN", ["fr-FR"]), "en", "an unknown saved value falls back to the browser language");
});

test("resolveSongNameLanguage: an unknown browser language keeps the site language", () => {
    assert.equal(resolveSongNameLanguage(null, []), "ja");
    assert.equal(resolveSongNameLanguage(null, [""]), "ja");
});

test("song display names: English names are shown with a language tag", () => {
    const song = { title: "アイネクライネ", titleEn: "Eine Kleine", artist: "米津玄師", artistEn: "Kenshi Yonezu" };

    assert.deepEqual(getSongDisplayTitle(song, "en"), { text: "Eine Kleine", lang: "en" });
    assert.deepEqual(getSongDisplayArtist(song, "en"), { text: "Kenshi Yonezu", lang: "en" });
    assert.deepEqual(getSongDisplayTitle(song, "ja"), { text: "アイネクライネ", lang: null });
    assert.deepEqual(getSongDisplayArtist(song, "ja"), { text: "米津玄師", lang: null });
});

test("song display names: songs without English names keep the Japanese names", () => {
    const song = { title: "曲", titleEn: "", artist: "歌手", artistEn: "  " };

    assert.deepEqual(getSongDisplayTitle(song, "en"), { text: "曲", lang: null });
    assert.deepEqual(getSongDisplayArtist(song, "en"), { text: "歌手", lang: null });
});

test("song display names: English names keep the sheet text as is", () => {
    const song = { title: "マトリョシカ", titleEn: "Matryoshka", artist: "ハチ feat. 初音ミク,GUMI", artistEn: "Hachi feat. Miku Hatsune,GUMI" };

    assert.equal(getSongDisplayArtist(song, "en").text, "Hachi feat. Miku Hatsune,GUMI");
});
