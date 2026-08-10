import test from "node:test";
import assert from "node:assert/strict";
import {
    appendCacheBusterToHtml,
    appendCacheBusterToJavaScriptImports,
    createAssetCacheBuster,
    createDeploymentMarker,
    parseArgs,
    resolvePagesArtifactOutputDir,
    resolvePagesArtifactSiteDir,
    shouldCopyAppAsset
} from "../scripts/build-pages-artifact.mjs";

test("pages artifact: adds cache busters to html entry assets", () => {
    const html = [
        '<link rel="stylesheet" href="styles.css">',
        '<script type="module" src="app/bootstrap.mjs"></script>',
        '<meta property="og:image" content="https://example.test/ogp.png">'
    ].join("\n");

    assert.equal(
        appendCacheBusterToHtml(html, "main/abc"),
        [
            '<link rel="stylesheet" href="styles.css?v=main%2Fabc">',
            '<script type="module" src="app/bootstrap.mjs?v=main%2Fabc"></script>',
            '<meta property="og:image" content="https://example.test/ogp.png">'
        ].join("\n")
    );
});

test("pages artifact: replaces existing html cache busters", () => {
    const html = '<link rel="stylesheet" href="styles.css?v=old">';

    assert.equal(
        appendCacheBusterToHtml(html, "new"),
        '<link rel="stylesheet" href="styles.css?v=new">'
    );
});

test("pages artifact: adds cache busters to relative JavaScript module specifiers", () => {
    const source = [
        'import { createThing } from "./thing.mjs";',
        'import "../side-effect.mjs?v=old";',
        'export { run } from "../run.mjs";',
        'const module = await import("./lazy.mjs");',
        'const external = await import("package-name");'
    ].join("\n");

    assert.equal(
        appendCacheBusterToJavaScriptImports(source, "sha-123"),
        [
            'import { createThing } from "./thing.mjs?v=sha-123";',
            'import "../side-effect.mjs?v=sha-123";',
            'export { run } from "../run.mjs?v=sha-123";',
            'const module = await import("./lazy.mjs?v=sha-123");',
            'const external = await import("package-name");'
        ].join("\n")
    );
});

test("pages artifact: reads cache buster from deploy environment", () => {
    assert.deepEqual(
        parseArgs(["--output-dir", "_site/out"], { DEPLOY_CACHE_BUSTER: "abc123" }),
        {
            outputDir: "_site/out",
            siteDir: ".",
            cacheBuster: "abc123",
            deploymentSha: ""
        }
    );
});

test("pages artifact: reads source site directory from arguments", () => {
    assert.deepEqual(
        parseArgs(["--site-dir", "_build"], { DEPLOY_CACHE_BUSTER: "abc123" }),
        {
            outputDir: "_site",
            siteDir: "_build",
            cacheBuster: "abc123",
            deploymentSha: ""
        }
    );
});

test("pages artifact: derives stable cache busters from static asset contents", () => {
    const assets = [
        { path: "styles.css", content: "body {}" },
        { path: "app/bootstrap.mjs", content: "import './app.mjs';" }
    ];
    const reversedAssets = [...assets].reverse();
    const changedAssets = [
        ...assets.slice(0, 1),
        { path: "app/bootstrap.mjs", content: "import './changed.mjs';" }
    ];

    assert.equal(createAssetCacheBuster(assets), createAssetCacheBuster(reversedAssets));
    assert.notEqual(createAssetCacheBuster(assets), createAssetCacheBuster(changedAssets));
});

test("pages artifact: separates deployment SHA from the asset cache buster", () => {
    assert.deepEqual(
        parseArgs([], {
            DEPLOY_CACHE_BUSTER: "asset-version",
            DEPLOY_SHA: "c2abca650af9fca8ff7a2ab28627ea3c3620d9b9"
        }),
        {
            outputDir: "_site",
            siteDir: ".",
            cacheBuster: "asset-version",
            deploymentSha: "c2abca650af9fca8ff7a2ab28627ea3c3620d9b9"
        }
    );
    assert.equal(
        createDeploymentMarker("c2abca650af9fca8ff7a2ab28627ea3c3620d9b9"),
        '{"sha":"c2abca650af9fca8ff7a2ab28627ea3c3620d9b9"}\n'
    );
});

test("pages artifact: excludes TypeScript source files from app assets", () => {
    assert.equal(shouldCopyAppAsset("/repo/knksongs/app/bootstrap.mjs"), true);
    assert.equal(shouldCopyAppAsset("/repo/knksongs/app/state.types.d.ts"), false);
    assert.equal(shouldCopyAppAsset("/repo/knksongs/app/lib/playback-settings/value-reducer.mts"), false);
});

test("pages artifact: resolves output directories inside the project root", () => {
    assert.equal(
        resolvePagesArtifactOutputDir("_site", "/repo/knksongs"),
        "/repo/knksongs/_site"
    );
    assert.equal(
        resolvePagesArtifactOutputDir("_site/pages", "/repo/knksongs"),
        "/repo/knksongs/_site/pages"
    );
});

test("pages artifact: resolves source site directories inside the project root", () => {
    assert.equal(
        resolvePagesArtifactSiteDir(".", "/repo/knksongs"),
        "/repo/knksongs"
    );
    assert.equal(
        resolvePagesArtifactSiteDir("_build", "/repo/knksongs"),
        "/repo/knksongs/_build"
    );
});

test("pages artifact: rejects unsafe output directories", () => {
    assert.throws(
        () => resolvePagesArtifactOutputDir(".", "/repo/knksongs"),
        /must not target the project root/
    );
    assert.throws(
        () => resolvePagesArtifactOutputDir("../outside", "/repo/knksongs"),
        /must stay inside the project root/
    );
    assert.throws(
        () => resolvePagesArtifactOutputDir("app", "/repo/knksongs"),
        /must be _site or its child directory/
    );
    assert.throws(
        () => resolvePagesArtifactOutputDir("data", "/repo/knksongs"),
        /must be _site or its child directory/
    );
    assert.throws(
        () => resolvePagesArtifactOutputDir(".git", "/repo/knksongs"),
        /must be _site or its child directory/
    );
    assert.throws(
        () => resolvePagesArtifactOutputDir("_site/.git", "/repo/knksongs"),
        /must not include dot directories/
    );
});

test("pages artifact: rejects unsafe source site directories", () => {
    assert.throws(
        () => resolvePagesArtifactSiteDir("../outside", "/repo/knksongs"),
        /must stay inside the project root/
    );
    assert.throws(
        () => resolvePagesArtifactSiteDir(".git", "/repo/knksongs"),
        /must not include dot directories/
    );
});
