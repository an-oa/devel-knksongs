import test from "node:test";
import assert from "node:assert/strict";
import {
    parseArgs,
    resolveSiteBuildOutputDir
} from "../scripts/build-site.mjs";

test("site build: parses output directory option", () => {
    assert.deepEqual(parseArgs([]), { outputDir: "_build" });
    assert.deepEqual(parseArgs(["--output-dir", "_build/local"]), { outputDir: "_build/local" });
});

test("site build: resolves output directories inside the project root", () => {
    assert.equal(
        resolveSiteBuildOutputDir("_build", "/repo/knksongs"),
        "/repo/knksongs/_build"
    );
    assert.equal(
        resolveSiteBuildOutputDir("_build/site", "/repo/knksongs"),
        "/repo/knksongs/_build/site"
    );
});

test("site build: rejects unsafe output directories", () => {
    assert.throws(
        () => resolveSiteBuildOutputDir(".", "/repo/knksongs"),
        /must not target the project root/
    );
    assert.throws(
        () => resolveSiteBuildOutputDir("../outside", "/repo/knksongs"),
        /must stay inside the project root/
    );
    assert.throws(
        () => resolveSiteBuildOutputDir("app", "/repo/knksongs"),
        /must be _build or its child directory/
    );
    assert.throws(
        () => resolveSiteBuildOutputDir("_build/.git", "/repo/knksongs"),
        /must not include dot directories/
    );
});
