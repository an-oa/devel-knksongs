import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/**
 * TypeScript emit 済みの起動 module を、データ取得・UI・共有処理の browser bundle にまとめる。
 * _build/app は Node tests と scripts 用の emit 結果として保つ。
 * @param {string} outputDir 検証済みの site build directory
 * @param {{ cacheBuster?: string }} [options] 明示バージョンは生成内容に含め、URLの決定はesbuildに任せる
 * @returns {Promise<void>}
 */
export async function buildBrowserModules(outputDir, { cacheBuster = "" } = {}) {
    const result = await build({
        entryPoints: [join(outputDir, "app/startup.mjs")],
        outdir: join(outputDir, "browser"),
        bundle: true,
        splitting: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        outExtension: { ".js": ".mjs" },
        entryNames: "[name]-[hash]",
        chunkNames: "[name]-[hash]",
        minify: true,
        metafile: true,
        banner: { js: "// Generated browser bundle. Do not edit; run npm run build." +
            (cacheBuster ? `\n// Build version: ${JSON.stringify(cacheBuster)}` : "") }
    });
    const startupOutput = Object.entries(result.metafile.outputs)
        .find(([, output]) => output.entryPoint?.endsWith("/app/startup.mjs"))?.[0];
    if (!startupOutput) throw new Error("Missing startup entry in browser build outputs");
    const startupPath = relative(outputDir, startupOutput).split(sep).join("/");
    const modulePaths = Object.keys(result.metafile.outputs)
        .map((filePath) => relative(outputDir, filePath).split(sep).join("/"))
        .sort();
    // dynamic import する UI と共有 chunk も HTML から発見できるようにする。
    // modulepreload は実行しないため、データ取得の開始は小さい startup module が担う。
    const preloads = modulePaths
        .filter((filePath) => filePath !== startupPath)
        .map((filePath) => `  <link rel="modulepreload" href="${filePath}">`)
        .join("\n");
    const htmlPath = join(outputDir, "index.html");
    const cssHash = cacheBuster || createHash("sha256").update(await readFile(join(outputDir, "styles.css"))).digest("hex");
    const html = (await readFile(htmlPath, "utf8"))
        .replace('href="styles.css"', `href="styles.css?v=${encodeURIComponent(cssHash)}"`);
    const entry = '  <script type="module" src="app/startup.mjs"></script>';
    if (!html.includes(entry)) throw new Error("Missing browser startup script in index.html");
    await writeFile(htmlPath, html.replace(entry, [
        preloads,
        `  <script type="module" src="${startupPath}"></script>`
    ].join("\n")), "utf8");
}
