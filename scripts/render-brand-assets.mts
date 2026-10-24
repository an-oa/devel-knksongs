#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import { resolveProjectPath } from "./lib/paths.mts";
import { PUBLIC_ASSET_DIR } from "./lib/site-assets.mts";

const BRAND_SOURCE_DIR = "design/brand";

/** 書き出すブランド画像と、その描画元・画像サイズ。 */
const BRAND_ASSETS = [
    { fileName: "ogp.png", source: "ogp.html", width: 1200, height: 630 },
    // 英語の OGP 用。同じ描画元を ?lang=en で開き、文字だけを英語にする。
    { fileName: "ogp-en.png", source: "ogp.html", query: "?lang=en", width: 1200, height: 630 },
    { fileName: "apple-touch-icon.png", source: "apple-touch-icon.html", width: 180, height: 180 }
] as const;
const FAVICON_PNG = { fileName: "favicon-32.png", source: "favicon.svg", size: 32 } as const;

/**
 * CLI 引数から出力先 directory を読む。
 */
export function parseArgs(args: string[]): { outputDir: string } {
    const options = { outputDir: PUBLIC_ASSET_DIR };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        if (arg === "--output-dir") {
            if (!next) throw new Error("--output-dir requires a directory path");
            options.outputDir = next;
            i++;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

/**
 * design/brand の HTML を Chromium で描画し、指定サイズの PNG として保存する。
 * query は描画元に渡す URL の query で、同じ描画元から文字だけ違う画像を作るときに使う。
 */
async function renderHtml(
    browser: Browser,
    source: string,
    outputPath: string,
    width: number,
    height: number,
    query = ""
): Promise<void> {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    try {
        await page.goto(`${pathToFileURL(resolve(BRAND_SOURCE_DIR, source)).href}${query}`);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: outputPath });
    } finally {
        await page.close();
    }
}

/**
 * favicon.svg を、SVG に未対応のブラウザ向けの透過 PNG として書き出す。
 */
async function renderFaviconPng(browser: Browser, outputPath: string): Promise<void> {
    const { size } = FAVICON_PNG;
    const svg = await readFile(resolve(PUBLIC_ASSET_DIR, FAVICON_PNG.source));
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    try {
        const src = `data:image/svg+xml;base64,${svg.toString("base64")}`;
        await page.setContent(
            `<html><body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`
        );
        await page.locator("img").evaluate((image: HTMLImageElement) => image.decode());
        await page.screenshot({ path: outputPath, omitBackground: true });
    } finally {
        await page.close();
    }
}

/**
 * OGP 画像・apple-touch-icon・PNG favicon を描画元から作り直す。
 * 描画は Chromium と OS の日本語フォント（Noto Sans CJK JP）に依存する。
 */
export async function renderBrandAssets(options: { outputDir: string }): Promise<string[]> {
    const outputDir = resolveProjectPath({
        targetPath: options.outputDir,
        pathLabel: "Brand asset output directory",
        allowProjectRoot: true
    });
    const browser = await chromium.launch();
    try {
        const written: string[] = [];
        for (const asset of BRAND_ASSETS) {
            const outputPath = join(outputDir, asset.fileName);
            await renderHtml(browser, asset.source, outputPath, asset.width, asset.height, "query" in asset ? asset.query : "");
            written.push(outputPath);
        }
        const faviconPath = join(outputDir, FAVICON_PNG.fileName);
        await renderFaviconPng(browser, faviconPath);
        written.push(faviconPath);
        return written;
    } finally {
        await browser.close();
    }
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryPointUrl) {
    try {
        const written = await renderBrandAssets(parseArgs(process.argv.slice(2)));
        for (const outputPath of written) console.log(`Rendered: ${outputPath}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
