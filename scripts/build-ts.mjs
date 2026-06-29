#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveProjectPath } from "./lib/paths.mjs";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const APP_DIR = join(PROJECT_ROOT, "app");
const DEFAULT_BUILD_DIR = "_build";
const GENERATED_HEADER_PATTERN = /^\/\/ Generated from .+\.\r?\n\/\/ Do not edit this \.mjs file by hand; edit the \.mts source and run npm run build:ts\.\r?\n\r?\n/;
const TS_CHECK_COMMENT_PATTERN = /^\/\/ @ts-check\r?\n\r?\n?/;

/**
 * OS ごとの差を吸収して npm executable 名を返す。
 * @returns {string}
 */
function getNpmExecutable() {
    return process.platform === "win32" ? "npm.cmd" : "npm";
}

/**
 * file path を git command 用の slash 区切り相対 path に変換する。
 * @param {string} filePath
 * @returns {string}
 */
function toGitPath(filePath) {
    return relative(PROJECT_ROOT, filePath).split(sep).join("/");
}

/**
 * command を実行し、失敗した場合はその終了コードで process を終了する。
 * @param {string} command
 * @param {string[]} args
 * @returns {void}
 */
function runCommand(command, args) {
    const result = spawnSync(command, args, {
        cwd: PROJECT_ROOT,
        stdio: "inherit"
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

/**
 * command の標準出力を文字列として取得する。
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
function readCommand(command, args) {
    const result = spawnSync(command, args, {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"]
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
    return result.stdout;
}

/**
 * build 出力先を安全な project root 配下の directory に解決する。
 * @param {string | undefined} outputDir
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resolveTypeScriptBuildOutputDir(outputDir, rootDir = PROJECT_ROOT) {
    return resolveProjectPath({
        targetPath: outputDir || DEFAULT_BUILD_DIR,
        rootDir,
        pathLabel: "TypeScript build output directory",
        requiredTopLevelDirectory: DEFAULT_BUILD_DIR
    });
}

/**
 * directory 配下の指定拡張子の file を再帰的に列挙する。
 * @param {string} directory
 * @param {string} extension
 * @returns {Promise<string[]>}
 */
async function listFilesByExtension(directory, extension) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nestedFiles = await Promise.all(entries.map(async (entry) => {
        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) return listFilesByExtension(entryPath, extension);
        if (entry.isFile() && entry.name.endsWith(extension)) return [entryPath];
        return [];
    }));
    return nestedFiles.flat().sort();
}

/**
 * directory 配下の指定拡張子の file を再帰的に列挙する。directory がない場合は空配列を返す。
 * @param {string} directory
 * @param {string} extension
 * @returns {Promise<string[]>}
 */
async function listExistingFilesByExtension(directory, extension) {
    try {
        await access(directory, constants.F_OK);
    } catch {
        return [];
    }
    return listFilesByExtension(directory, extension);
}

/**
 * app 配下の .mts source を再帰的に列挙する。
 * @returns {Promise<string[]>}
 */
async function listTypeScriptModuleSources() {
    return listFilesByExtension(APP_DIR, ".mts");
}

/**
 * .mts source に対応する _build/app 生成 .mjs の path を返す。
 * @param {string} sourcePath
 * @param {string} outputDir
 * @returns {string}
 */
function getEmittedModulePath(sourcePath, outputDir) {
    const relativeSourcePath = relative(APP_DIR, sourcePath);
    return join(outputDir, "app", relativeSourcePath).replace(/\.mts$/, ".mjs");
}

/**
 * 生成 .mjs の先頭へ手編集禁止ヘッダーを作る。
 * @param {string} sourcePath
 * @returns {string}
 */
function createGeneratedHeader(sourcePath) {
    const sourceGitPath = toGitPath(sourcePath);
    return [
        `// Generated from ${sourceGitPath}.`,
        "// Do not edit this .mjs file by hand; edit the .mts source and run npm run build:ts.",
        ""
    ].join("\n");
}

/**
 * 既存の生成ヘッダーを取り除き、最新の source path に合わせたヘッダーを付け直す。
 * @param {string} sourcePath
 * @param {string} emittedPath
 * @returns {Promise<void>}
 */
async function writeGeneratedHeader(sourcePath, emittedPath) {
    const source = await readFile(emittedPath, "utf8");
    const sourceWithoutHeader = source
        .replace(GENERATED_HEADER_PATTERN, "")
        .replace(TS_CHECK_COMMENT_PATTERN, "");
    const nextSource = `${createGeneratedHeader(sourcePath)}\n${sourceWithoutHeader}`;
    if (nextSource !== source) {
        await writeFile(emittedPath, nextSource, "utf8");
    }
}

/**
 * 生成 .mjs が存在することを確認する。
 * @param {string[]} emittedPaths
 * @returns {Promise<void>}
 */
async function assertEmittedModulesExist(emittedPaths) {
    const missingPaths = [];
    for (const emittedPath of emittedPaths) {
        try {
            await access(emittedPath, constants.F_OK);
        } catch {
            missingPaths.push(toGitPath(emittedPath));
        }
    }
    if (missingPaths.length > 0) {
        console.error("Missing emitted .mjs files:");
        for (const missingPath of missingPaths) {
            console.error(`- ${missingPath}`);
        }
        process.exit(1);
    }
}

/**
 * 旧方式で app 配下に生成されていた .mjs を削除する。
 * 生成ヘッダーがない .mjs は手編集の可能性があるため削除せず停止する。
 * @param {string[]} sourcePaths
 * @returns {Promise<void>}
 */
async function removeGeneratedAdjacentModules(sourcePaths) {
    const unsafePaths = [];
    await Promise.all(sourcePaths.map(async (sourcePath) => {
        const adjacentPath = sourcePath.replace(/\.mts$/, ".mjs");
        let source;
        try {
            source = await readFile(adjacentPath, "utf8");
        } catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                return;
            }
            throw error;
        }
        if (!GENERATED_HEADER_PATTERN.test(source)) {
            unsafePaths.push(toGitPath(adjacentPath));
            return;
        }
        await rm(adjacentPath);
    }));
    if (unsafePaths.length > 0) {
        console.error("Refusing to remove app .mjs files without the generated header:");
        for (const unsafePath of unsafePaths.sort()) {
            console.error(`- ${unsafePath}`);
        }
        process.exit(1);
    }
}

/**
 * app 配下に .mjs が残っていないことを確認する。
 * @returns {Promise<void>}
 */
async function assertAppModulesAbsent() {
    const modulePaths = await listExistingFilesByExtension(APP_DIR, ".mjs");
    if (modulePaths.length === 0) return;
    console.error("app .mjs files must not remain in the TypeScript source tree:");
    for (const modulePath of modulePaths.map(toGitPath)) {
        console.error(`- ${modulePath}`);
    }
    process.exit(1);
}

/**
 * 生成 .mjs が git 管理対象になっていないことを確認する。
 * @param {string[]} emittedPaths
 * @returns {void}
 */
function assertEmittedModulesUntracked(emittedPaths) {
    const emittedGitPaths = emittedPaths.map(toGitPath);
    const trackedPaths = new Set(
        readCommand("git", ["ls-files", "--", ...emittedGitPaths])
            .split(/\r?\n/)
            .filter(Boolean)
    );
    const trackedEmittedPaths = emittedGitPaths.filter((emittedPath) => trackedPaths.has(emittedPath));
    if (trackedEmittedPaths.length > 0) {
        console.error("Generated app .mjs files must stay out of git tracking:");
        for (const trackedPath of trackedEmittedPaths) {
            console.error(`- ${trackedPath}`);
        }
        process.exit(1);
    }
}

/**
 * TypeScript module を _build/app へ emit し、生成 .mjs にヘッダーを付ける。
 * @param {{ check?: boolean, outputDir?: string }} [options]
 * @returns {Promise<void>}
 */
export async function buildTypeScriptModules(options = {}) {
    const outputDir = resolveTypeScriptBuildOutputDir(options.outputDir);
    await rm(join(outputDir, "app"), { recursive: true, force: true });
    runCommand(getNpmExecutable(), [
        "exec",
        "tsc",
        "--",
        "--project",
        "tsconfig.build.json",
        "--outDir",
        outputDir
    ]);
    const sourcePaths = await listTypeScriptModuleSources();
    const emittedPaths = sourcePaths.map((sourcePath) => getEmittedModulePath(sourcePath, outputDir));
    await assertEmittedModulesExist(emittedPaths);
    await Promise.all(sourcePaths.map((sourcePath) => (
        writeGeneratedHeader(sourcePath, getEmittedModulePath(sourcePath, outputDir))
    )));
    await removeGeneratedAdjacentModules(sourcePaths);
    await assertAppModulesAbsent();
    if (options.check) {
        await checkTypeScriptEmit({ outputDir });
    }
}

/**
 * 既存の TypeScript emit 結果を検査する。CI など、直前に build 済みの経路で使う。
 * @param {{ outputDir?: string }} [options]
 * @returns {Promise<void>}
 */
export async function checkTypeScriptEmit(options = {}) {
    const outputDir = resolveTypeScriptBuildOutputDir(options.outputDir);
    const sourcePaths = await listTypeScriptModuleSources();
    const emittedPaths = sourcePaths.map((sourcePath) => getEmittedModulePath(sourcePath, outputDir));
    await assertEmittedModulesExist(emittedPaths);
    await assertAppModulesAbsent();
    assertEmittedModulesUntracked(emittedPaths);
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryPointUrl) {
    const args = process.argv.slice(2);
    const knownArgs = new Set(["--check", "--check-only"]);
    const unknownArgs = args.filter((arg) => !knownArgs.has(arg));
    if (unknownArgs.length > 0) {
        console.error(`Unknown argument: ${unknownArgs[0]}`);
        process.exit(1);
    }
    if (args.includes("--check") && args.includes("--check-only")) {
        console.error("--check and --check-only cannot be used together");
        process.exit(1);
    }
    try {
        if (args.includes("--check-only")) {
            await checkTypeScriptEmit();
        } else {
            await buildTypeScriptModules({ check: args.includes("--check") });
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
