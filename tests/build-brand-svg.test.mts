import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brandSvgFiles, parsePath, writeBrandSvgs } from "../scripts/build-brand-svg.mts";

test("parsePath: 直線の H V L を3次ベジェ区間にそろえ、Z で閉じる", () => {
    const [subpath] = parsePath("M0 0 H3 V6 L0 0 Z");
    assert.deepEqual(subpath.start, [0, 0]);
    assert.equal(subpath.closed, true);
    assert.equal(subpath.segments.length, 3);
    assert.deepEqual(subpath.segments[0], [[1, 0], [2, 0], [3, 0]]);
    assert.deepEqual(subpath.segments[1][2], [3, 6]);
    assert.deepEqual(subpath.segments[2][2], [0, 0]);
});

test("parsePath: M で始まらない path と未対応の命令を拒否する", () => {
    assert.throws(() => parsePath("L1 1"), /must start with M/);
    assert.throws(() => parsePath("M0 0 A1 1 0 0 1 2 2"), /Unsupported path data/);
    assert.throws(() => parsePath("M0 0 l1 1"), /Unsupported path data/);
});

for (const file of brandSvgFiles()) {
    test(`build-brand-svg: ${file.path} の参照先がすべて同じ SVG 内にある`, () => {
        assert.doesNotMatch(file.content, /NaN|Infinity/);
        const ids = new Set([...file.content.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
        const references = [...file.content.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((match) => match[1] ?? match[2]);
        assert.ok(references.length > 0);
        for (const reference of references) assert.ok(ids.has(reference), `missing #${reference}`);
    });

    test(`build-brand-svg: ${file.path} はスクリプトの出力と一致する`, async () => {
        assert.equal(await readFile(file.path, "utf8"), file.content);
    });
}

test("build-brand-svg: 指定したルート配下へ3つの SVG を書き出す", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "knksongs-brand-svg-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const written = await writeBrandSvgs(root);
    assert.deepEqual(written, brandSvgFiles().map((file) => join(root, file.path)));
    for (const file of brandSvgFiles()) assert.equal(await readFile(join(root, file.path), "utf8"), file.content);
});
