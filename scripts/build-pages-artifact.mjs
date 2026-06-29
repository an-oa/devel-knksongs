#!/usr/bin/env node

import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveProjectPath } from "./lib/paths.mjs";
import {
    DATA_ASSET_FILES,
    ROOT_ASSET_FILES,
    shouldCopyAppAsset
} from "./lib/site-assets.mjs";

const DEFAULT_OUTPUT_DIR = "_site";
const DEFAULT_SITE_DIR = ".";
const HTML_CACHE_BUSTER_TARGETS = [
    { attribute: "href", path: "styles.css" },
    { attribute: "src", path: "app/bootstrap.mjs" }
];
const STATIC_MODULE_SPECIFIER_PATTERN = /((?:import|export)\s+(?:[^'"]*?\s+from\s*)?)(["'])(\.{1,2}\/[^"']+?\.mjs)(?:\?[^"']*)?\2/g;
const DYNAMIC_MODULE_SPECIFIER_PATTERN = /(\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']+?\.mjs)(?:\?[^"']*)?\2/g;

/**
 * 正規表現内で通常文字として扱うために文字列を escape する。
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * artifact 内の asset path に cache buster を付ける。
 * @param {string} assetPath
 * @param {string} cacheBuster
 * @returns {string}
 */
function appendCacheBuster(assetPath, cacheBuster) {
    return `${assetPath}?v=${encodeURIComponent(cacheBuster)}`;
}

/**
 * HTML の公開 entry asset に cache buster を付ける。
 * 本番 artifact 生成で使う変換で、境界条件を単体テストするため export している。
 * @param {string} html
 * @param {string} cacheBuster
 * @returns {string}
 */
export function appendCacheBusterToHtml(html, cacheBuster) {
    return HTML_CACHE_BUSTER_TARGETS.reduce((nextHtml, target) => {
        const attributePattern = new RegExp(
            `(${target.attribute}\\s*=\\s*)(["'])${escapeRegExp(target.path)}(?:\\?[^"']*)?\\2`,
            "g"
        );
        return nextHtml.replace(
            attributePattern,
            `$1$2${appendCacheBuster(target.path, cacheBuster)}$2`
        );
    }, html);
}

/**
 * JavaScript module 内の相対 .mjs 参照に cache buster を付ける。
 * 本番 artifact 生成で使う変換で、境界条件を単体テストするため export している。
 * @param {string} source
 * @param {string} cacheBuster
 * @returns {string}
 */
export function appendCacheBusterToJavaScriptImports(source, cacheBuster) {
    const replaceModuleSpecifier = (
        /** @type {string} */ _match,
        /** @type {string} */ prefix,
        /** @type {string} */ quote,
        /** @type {string} */ specifier
    ) => `${prefix}${quote}${appendCacheBuster(specifier, cacheBuster)}${quote}`;
    return source
        .replace(STATIC_MODULE_SPECIFIER_PATTERN, replaceModuleSpecifier)
        .replace(DYNAMIC_MODULE_SPECIFIER_PATTERN, replaceModuleSpecifier);
}

/**
 * CLI 引数と環境変数から artifact 生成オプションを作る。
 * @param {string[]} args
 * @param {Record<string, string | undefined>} env
 * @returns {{ outputDir: string, siteDir: string, cacheBuster: string }}
 */
export function parseArgs(args, env = process.env) {
    const options = {
        outputDir: env.PAGES_ARTIFACT_DIR || DEFAULT_OUTPUT_DIR,
        siteDir: env.PAGES_SITE_DIR || DEFAULT_SITE_DIR,
        cacheBuster: env.DEPLOY_CACHE_BUSTER || env.GITHUB_SHA || ""
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        if (arg === "--output-dir") {
            if (!next) throw new Error("--output-dir requires a directory path");
            options.outputDir = next;
            i++;
            continue;
        }
        if (arg === "--site-dir") {
            if (!next) throw new Error("--site-dir requires a directory path");
            options.siteDir = next;
            i++;
            continue;
        }
        if (arg === "--cache-buster") {
            if (!next) throw new Error("--cache-buster requires a version value");
            options.cacheBuster = next;
            i++;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    options.cacheBuster = options.cacheBuster.trim();
    if (!options.cacheBuster) {
        throw new Error("DEPLOY_CACHE_BUSTER or GITHUB_SHA is required");
    }
    return options;
}

/**
 * artifact 出力先を安全な project root 配下の directory に解決する。
 * 本番 artifact 生成で rm の対象を限定し、境界条件を単体テストするため export している。
 * @param {string} outputDir
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resolvePagesArtifactOutputDir(outputDir, rootDir = process.cwd()) {
    return resolveProjectPath({
        targetPath: outputDir,
        rootDir,
        pathLabel: "Pages artifact output directory",
        requiredTopLevelDirectory: DEFAULT_OUTPUT_DIR
    });
}

/**
 * artifact の入力元となる静的 site directory を project root 配下に解決する。
 * @param {string} siteDir
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resolvePagesArtifactSiteDir(siteDir, rootDir = process.cwd()) {
    return resolveProjectPath({
        targetPath: siteDir,
        rootDir,
        pathLabel: "Pages artifact site directory",
        allowProjectRoot: true
    });
}

export { shouldCopyAppAsset };

/**
 * 公開に必要な静的ファイルを artifact directory へコピーする。
 * @param {string} outputDir
 * @param {string} siteDir
 * @returns {Promise<void>}
 */
async function copySiteAssets(outputDir, siteDir) {
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(join(outputDir, "data"), { recursive: true });
    await Promise.all(ROOT_ASSET_FILES.map((fileName) => (
        copyFile(join(siteDir, fileName), join(outputDir, fileName))
    )));
    await cp(join(siteDir, "app"), join(outputDir, "app"), {
        recursive: true,
        filter: shouldCopyAppAsset
    });
    await Promise.all(DATA_ASSET_FILES.map((fileName) => (
        copyFile(join(siteDir, "data", fileName), join(outputDir, "data", fileName))
    )));
}

/**
 * 指定 directory 配下の .mjs ファイルを再帰的に列挙する。
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function listModuleFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nestedFiles = await Promise.all(entries.map(async (entry) => {
        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) return listModuleFiles(entryPath);
        if (entry.isFile() && entry.name.endsWith(".mjs")) return [entryPath];
        return [];
    }));
    return nestedFiles.flat();
}

/**
 * テキストファイルを読み込み、変化がある場合だけ書き戻す。
 * @param {string} filePath
 * @param {(text: string) => string} transform
 * @returns {Promise<void>}
 */
async function transformTextFile(filePath, transform) {
    const text = await readFile(filePath, "utf8");
    const nextText = transform(text);
    if (nextText !== text) {
        await writeFile(filePath, nextText, "utf8");
    }
}

/**
 * GitHub Pages へ upload する静的 artifact を生成する。
 * @param {{ outputDir: string, siteDir?: string, cacheBuster: string }} options
 * @returns {Promise<string>}
 */
export async function buildPagesArtifact(options) {
    const outputDir = resolvePagesArtifactOutputDir(options.outputDir);
    const siteDir = resolvePagesArtifactSiteDir(options.siteDir || DEFAULT_SITE_DIR);
    await copySiteAssets(outputDir, siteDir);
    await transformTextFile(
        join(outputDir, "index.html"),
        (html) => appendCacheBusterToHtml(html, options.cacheBuster)
    );
    const moduleFiles = await listModuleFiles(join(outputDir, "app"));
    await Promise.all(moduleFiles.map((filePath) => (
        transformTextFile(
            filePath,
            (source) => appendCacheBusterToJavaScriptImports(source, options.cacheBuster)
        )
    )));
    return outputDir;
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryPointUrl) {
    try {
        const options = parseArgs(process.argv.slice(2));
        const outputDir = await buildPagesArtifact(options);
        console.log(`Prepared Pages artifact: ${outputDir}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
