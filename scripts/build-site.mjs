#!/usr/bin/env node

import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { shouldCopyAppAsset } from "./build-pages-artifact.mjs";

const DEFAULT_BUILD_DIR = "_build";
const ROOT_ASSET_FILES = ["index.html", "styles.css", "ogp.png"];
const DATA_ASSET_FILES = ["songs.json", "songs-meta.json"];

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
    const projectRoot = resolve(rootDir);
    const resolvedOutputDir = resolve(projectRoot, outputDir);
    const relativeOutputDir = relative(projectRoot, resolvedOutputDir);
    if (!relativeOutputDir) {
        throw new Error("Site build output directory must not target the project root");
    }
    if (relativeOutputDir.startsWith("..") || isAbsolute(relativeOutputDir)) {
        throw new Error("Site build output directory must stay inside the project root");
    }
    const outputPathSegments = relativeOutputDir.split(/[\\/]+/).filter(Boolean);
    if (outputPathSegments[0] !== DEFAULT_BUILD_DIR) {
        throw new Error(`Site build output directory must be ${DEFAULT_BUILD_DIR} or its child directory`);
    }
    if (outputPathSegments.some((segment) => segment.startsWith("."))) {
        throw new Error("Site build output directory must not include dot directories");
    }
    return resolvedOutputDir;
}

/**
 * TypeScript 生成済みの JavaScript を含む静的 site build を作る。
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
    await cp(resolve("app"), join(outputDir, "app"), {
        recursive: true,
        filter: shouldCopyAppAsset
    });
    await Promise.all(DATA_ASSET_FILES.map((fileName) => (
        copyFile(resolve("data", fileName), join(outputDir, "data", fileName))
    )));
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
