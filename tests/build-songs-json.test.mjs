import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSongsJson } from "../scripts/build-songs-json.mjs";
import { validateSongsJsonArtifacts } from "../scripts/songs-json-artifact.mjs";

/**
 * JSON生成スクリプト用のローカルCSVを作る。
 * @param {string} url 曲URL
 * @returns {string} CSV文字列
 */
function makeCsv(url) {
    return [
        "#,配信日,配信上の立場,画面の向き,公開範囲,形態,歌枠リレー？,ハモリあり？,##,曲名,アーティスト名,キョクメイ,アーティストメイ,URL,終了時刻,メモ",
        `1,2026/03/11,,横,全体,歌みた,,,1,Song,Artist,ソング,アーティスト,${url},,`
    ].join("\n");
}

test("songs json build: validates CSV-derived songs before replacing either artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "knksongs-build-json-"));
    const inputPath = join(directory, "songs.csv");
    const outputPath = join(directory, "songs.json");
    const metaOutputPath = join(directory, "songs-meta.json");
    try {
        await Promise.all([
            writeFile(inputPath, makeCsv("https://example.com/watch?v=abc123def45"), "utf8"),
            writeFile(outputPath, "existing songs", "utf8"),
            writeFile(metaOutputPath, "existing meta", "utf8")
        ]);

        await assert.rejects(
            buildSongsJson({ inputPath, outputPath, metaOutputPath, sourceUrl: "" }),
            /CSV song data validation failed/
        );
        assert.equal(await readFile(outputPath, "utf8"), "existing songs");
        assert.equal(await readFile(metaOutputPath, "utf8"), "existing meta");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("songs json build: writes matching derived artifacts after CSV validation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "knksongs-build-json-"));
    const inputPath = join(directory, "songs.csv");
    const outputPath = join(directory, "songs.json");
    const metaOutputPath = join(directory, "songs-meta.json");
    try {
        await writeFile(
            inputPath,
            makeCsv("https://www.youtube.com/watch?v=abc123def45"),
            "utf8"
        );

        assert.equal(await buildSongsJson({ inputPath, outputPath, metaOutputPath, sourceUrl: "" }), 1);
        const [songsJsonText, songsMetaJsonText] = await Promise.all([
            readFile(outputPath, "utf8"),
            readFile(metaOutputPath, "utf8")
        ]);
        assert.equal(validateSongsJsonArtifacts(songsJsonText, songsMetaJsonText), 1);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
