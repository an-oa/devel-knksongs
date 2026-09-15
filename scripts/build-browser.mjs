import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/**
 * TypeScript emit 済みの起動 module を、データ取得・UI・共有処理の browser bundle にまとめる。
 * _build/app は Node tests と scripts 用の emit 結果として保つ。
 * @param {string} outputDir 検証済みの site build directory
 * @returns {Promise<void>}
 */
export async function buildBrowserModules(outputDir) {
    const result = await build({
        entryPoints: [join(outputDir, "app/startup.mjs")],
        outdir: join(outputDir, "browser"),
        bundle: true,
        splitting: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        outExtension: { ".js": ".mjs" },
        chunkNames: "[name]-[hash]",
        minify: true,
        metafile: true,
        banner: { js: "// Generated browser bundle. Do not edit; run npm run build." }
    });
    const modulePaths = Object.keys(result.metafile.outputs)
        .map((filePath) => relative(outputDir, filePath).split(sep).join("/"))
        .sort();
    // dynamic import する UI と共有 chunk も HTML から発見できるようにする。
    // modulepreload は実行しないため、データ取得の開始は小さい startup module が担う。
    const preloads = modulePaths
        .filter((filePath) => filePath !== "browser/startup.mjs")
        .map((filePath) => `  <link rel="modulepreload" href="${filePath}">`)
        .join("\n");
    const htmlPath = join(outputDir, "index.html");
    const html = await readFile(htmlPath, "utf8");
    const entry = '  <script type="module" src="app/startup.mjs"></script>';
    if (!html.includes(entry)) throw new Error("Missing browser startup script in index.html");
    await writeFile(htmlPath, html.replace(entry, [
        preloads,
        '  <script type="module" src="browser/startup.mjs"></script>'
    ].join("\n")), "utf8");
}
