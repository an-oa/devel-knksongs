#!/usr/bin/env node

import { copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildTypeScriptModules } from "./build-ts.mjs";
import { resolveProjectPath } from "./lib/paths.mjs";
import { DATA_ASSET_FILES, ROOT_ASSET_FILES } from "./lib/site-assets.mjs";

const DEFAULT_BUILD_DIR = "_build";

/**
 * CLI 引数から build option を作る。
 * @param {string[]} args
 * @returns {{ outputDir: string }}
 */
export function parseArgs(args) {
    const options = {
        outputDir: DEFAULT_BUILD_DIR
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
        throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

/**
 * build 出力先を安全な project root 配下の directory に解決する。
 * @param {string} outputDir
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resolveSiteBuildOutputDir(outputDir, rootDir = process.cwd()) {
    return resolveProjectPath({
        targetPath: outputDir,
        rootDir,
        pathLabel: "Site build output directory",
        requiredTopLevelDirectory: DEFAULT_BUILD_DIR
    });
}

/**
 * 静的 asset と TypeScript 生成 JavaScript を含む site build を作る。
 * @param {{ outputDir: string }} options
 * @returns {Promise<string>}
 */
export async function buildSite(options) {
    const outputDir = resolveSiteBuildOutputDir(options.outputDir);
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(join(outputDir, "data"), { recursive: true });
    await Promise.all(ROOT_ASSET_FILES.map((fileName) => (
        copyFile(resolve(fileName), join(outputDir, fileName))
    )));
    await Promise.all(DATA_ASSET_FILES.map((fileName) => (
        copyFile(resolve("data", fileName), join(outputDir, "data", fileName))
    )));
    await buildTypeScriptModules({ outputDir });
    return outputDir;
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryPointUrl) {
    try {
        const options = parseArgs(process.argv.slice(2));
        const outputDir = await buildSite(options);
        console.log(`Prepared site build: ${outputDir}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
