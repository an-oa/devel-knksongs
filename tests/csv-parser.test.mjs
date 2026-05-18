import test from "node:test";
import assert from "node:assert/strict";
import { parseCsvToSongs } from "../app/lib/csv-parser.mjs";

test("csv: explicit video orientation is parsed from 画面の向き", () => {
    const csv = [
        "#,配信日,配信での立場,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        "1,2026/03/11,,縦,全体,配信,,,1,KING,Kanaria feat. GUMI,キング,カナリアフィーチャリンググミ,https://www.youtube.com/watch?v=abc123&t=10s,0:09:41,"
    ].join("\n");
    const songs = parseCsvToSongs(csv);
    assert.equal(songs.length, 1);
    assert.equal(songs[0].videoOrientation, "vertical");
    assert.equal(songs[0].streamRole, "");
    assert.equal(songs[0].endSeconds, 581);
});

test("csv: 配信での立場 column keeps 収録 rows parseable", () => {
    const csv = [
        "#,配信日,配信での立場,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        "161,2025/11/23,ゲスト,横,全体,収録,◯,◯,1,GIRA×2★SEVEN,HE★VENS,ギラギラセブン,ヘブンズ,https://www.youtube.com/watch?v=1QvjYDqhWsk&t=152s,0:07:41,#藤音カナデ さん主催"
    ].join("\n");
    const songs = parseCsvToSongs(csv);
    assert.equal(songs.length, 1);
    assert.equal(songs[0].archiveId, "161");
    assert.equal(songs[0].format, "収録");
    assert.equal(songs[0].streamRole, "ゲスト");
    assert.equal(songs[0].videoOrientation, "landscape");
    assert.equal(songs[0].isRelay, true);
    assert.equal(songs[0].isHarmony, true);
    assert.equal(songs[0].endSeconds, 461);
});

test("csv: missing 配信での立場 column keeps legacy csv cache parseable", () => {
    const csv = [
        "#,配信日,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        "1,2026/03/11,縦,全体,配信,,,1,KING,Kanaria feat. GUMI,キング,カナリアフィーチャリンググミ,https://www.youtube.com/watch?v=abc123&t=10s,0:09:41,"
    ].join("\n");
    const songs = parseCsvToSongs(csv);
    assert.equal(songs.length, 1);
    assert.equal(songs[0].streamRole, "");
    assert.equal(songs[0].videoOrientation, "vertical");
});

test("csv: invalid 画面の向き value warns and falls back to auto detection", () => {
    const csv = [
        "#,配信日,配信での立場,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        "1,2026/03/11,,縦型,全体,配信,,,1,KING,Kanaria feat. GUMI,キング,カナリアフィーチャリンググミ,https://www.youtube.com/watch?v=abc123&t=10s,0:09:41,"
    ].join("\n");
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => {
        warnings.push(String(message));
    };
    try {
        const songs = parseCsvToSongs(csv);
        assert.equal(songs.length, 1);
        assert.equal(songs[0].videoOrientation, "");
    } finally {
        console.warn = originalWarn;
    }
    assert.deepEqual(warnings, ['CSV画面の向きが不正です: 2行目 "縦型"']);
});

test("csv: invalid 終了時刻 value warns and falls back to null", () => {
    const csv = [
        "#,配信日,配信での立場,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        "1,2026/03/11,,縦,全体,配信,,,1,KING,Kanaria feat. GUMI,キング,カナリアフィーチャリンググミ,https://www.youtube.com/watch?v=abc123&t=10s,0:99:41,"
    ].join("\n");
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => {
        warnings.push(String(message));
    };
    try {
        const songs = parseCsvToSongs(csv);
        assert.equal(songs.length, 1);
        assert.equal(songs[0].endSeconds, null);
    } finally {
        console.warn = originalWarn;
    }
    assert.deepEqual(warnings, ['CSV終了時刻が不正です: 2行目 "0:99:41"']);
});

test("csv: missing 終了時刻 column keeps backward compatibility", () => {
    const csv = [
        "#,配信日,配信での立場,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,メモ",
        "1,2026/03/11,,横,全体,配信,,,1,KING,Kanaria feat. GUMI,キング,カナリアフィーチャリンググミ,https://www.youtube.com/watch?v=abc123&t=10s,"
    ].join("\n");
    const songs = parseCsvToSongs(csv);
    assert.equal(songs.length, 1);
    assert.equal(songs[0].endSeconds, null);
    assert.equal(songs[0].videoOrientation, "landscape");
});
