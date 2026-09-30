import test from "node:test";
import assert from "node:assert/strict";
import {
    parseArgs,
    resolveSiteBuildOutputDir
} from "../scripts/build-site.mjs";

test("site build: parses output directory option", () => {
    assert.deepEqual(parseArgs([], {}), { outputDir: "_build", cacheBuster: "" });
    assert.deepEqual(parseArgs(["--output-dir", "_build/local"], {}), { outputDir: "_build/local", cacheBuster: "" });
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

test("site build: handles explicit asset versions at build time", () => {
    assert.equal(parseArgs([], { DEPLOY_CACHE_BUSTER: "release/v1" }).cacheBuster, "release/v1");
    assert.equal(parseArgs(["--cache-buster", "override"], { DEPLOY_CACHE_BUSTER: "old" }).cacheBuster, "override");
});
