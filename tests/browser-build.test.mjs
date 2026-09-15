import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { buildBrowserModules } from "../scripts/build-browser.mjs";
import { buildPagesArtifact } from "../scripts/build-pages-artifact.mjs";

test("browser build: bundles shared startup data and preserves preload URLs in Pages", async (t) => {
    const root = await mkdtemp(join(process.cwd(), "_build/browser-test-"));
    const outputDir = `_site/${relative(join(process.cwd(), "_build"), root)}`;
    t.after(async () => {
        await rm(root, { recursive: true, force: true });
        await rm(outputDir, { recursive: true, force: true });
    });
    await mkdir(join(root, "app"));
    await mkdir(join(root, "data"));
    await Promise.all([
        writeFile(join(root, "index.html"), '<head>\n  <script type="module" src="app/startup.mjs"></script>\n</head>'),
        writeFile(join(root, "styles.css"), "body {}"),
        writeFile(join(root, "ogp.png"), "fixture"),
        writeFile(join(root, "data/songs.json"), "{}"),
        writeFile(join(root, "data/songs-meta.json"), "{}"),
        writeFile(join(root, "app/startup.mjs"), 'import "./data.mjs"; void import("./bootstrap.mjs");'),
        writeFile(join(root, "app/data.mjs"), 'export const snapshot = fetch("data/songs.json");'),
        writeFile(join(root, "app/bootstrap.mjs"), 'import { snapshot } from "./data.mjs"; snapshot.then(() => console.log("ready"));')
    ]);
    await buildBrowserModules(root);
    const files = await readdir(join(root, "browser"));
    assert.equal(files.length, 3, "startup, UI, and one shared module");
    assert.ok(files.every((file) => file.endsWith(".mjs")), "no TypeScript or source maps in bundles");
    const sources = await Promise.all(files.map((file) => readFile(join(root, "browser", file), "utf8")));
    assert.equal(sources.join("").match(/fetch\(/g)?.length, 1, "data request code is shared, not duplicated");
    const startup = await readFile(join(root, "browser/startup.mjs"), "utf8");
    assert.match(startup, /import\("\.\/bootstrap-/);

    await buildPagesArtifact({ outputDir, siteDir: root, cacheBuster: "fixture/version" });
    const html = await readFile(join(outputDir, "index.html"), "utf8");
    assert.ok(!html.includes("app/startup.mjs"));
    for (const file of files) {
        assert.ok(html.includes(`browser/${file}?v=fixture%2Fversion`), "each bundle is discoverable from HTML");
        const source = await readFile(join(outputDir, "browser", file), "utf8");
        for (const match of source.matchAll(/["']\.\/([^"']+\.mjs\?v=[^"']+)["']/g)) {
            assert.ok(html.includes(`browser/${match[1]}`), "preload and import use the same versioned URL");
        }
        assert.doesNotMatch(source, /["']\.\/[^"'?]+\.mjs["']/, "no unversioned chunk import");
    }
});
