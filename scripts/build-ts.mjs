#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const APP_DIR = join(PROJECT_ROOT, "app");
const GENERATED_HEADER_PATTERN = /^\/\/ Generated from .+\.\r?\n\/\/ Do not edit this \.mjs file by hand; edit the \.mts source and run npm run build:ts\.\r?\n\r?\n/;

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
 * directory 配下の .mts source を再帰的に列挙する。
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function listTypeScriptModuleSources(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nestedFiles = await Promise.all(entries.map(async (entry) => {
        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) return listTypeScriptModuleSources(entryPath);
        if (entry.isFile() && entry.name.endsWith(".mts")) return [entryPath];
        return [];
    }));
    return nestedFiles.flat().sort();
}

/**
 * .mts source に対応する隣接生成 .mjs の path を返す。
 * @param {string} sourcePath
 * @returns {string}
 */
function getEmittedModulePath(sourcePath) {
    return sourcePath.replace(/\.mts$/, ".mjs");
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
    const sourceWithoutHeader = source.replace(GENERATED_HEADER_PATTERN, "");
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
 * 生成 .mjs が git 管理対象になっていることを確認する。
 * @param {string[]} emittedPaths
 * @returns {void}
 */
function assertEmittedModulesTracked(emittedPaths) {
    const emittedGitPaths = emittedPaths.map(toGitPath);
    const trackedPaths = new Set(
        readCommand("git", ["ls-files", "--", ...emittedGitPaths])
            .split(/\r?\n/)
            .filter(Boolean)
    );
    const untrackedPaths = emittedGitPaths.filter((emittedPath) => !trackedPaths.has(emittedPath));
    if (untrackedPaths.length > 0) {
        console.error("Generated .mjs files must be committed while app imports still read .mjs:");
        for (const untrackedPath of untrackedPaths) {
            console.error(`- ${untrackedPath}`);
        }
        process.exit(1);
    }
}

/**
 * 生成 .mjs に未同期の差分が残っていないことを確認する。
 * @param {string[]} emittedPaths
 * @returns {void}
 */
function assertEmittedModulesClean(emittedPaths) {
    runCommand("git", ["diff", "--exit-code", "--", ...emittedPaths.map(toGitPath)]);
}

/**
 * TypeScript module を emit し、生成 .mjs にヘッダーを付ける。
 * @param {{ check: boolean }} options
 * @returns {Promise<void>}
 */
async function buildTypeScriptModules(options) {
    runCommand(getNpmExecutable(), ["exec", "tsc", "--", "--project", "tsconfig.build.json"]);
    const sourcePaths = await listTypeScriptModuleSources(APP_DIR);
    const emittedPaths = sourcePaths.map(getEmittedModulePath);
    await assertEmittedModulesExist(emittedPaths);
    await Promise.all(sourcePaths.map((sourcePath) => (
        writeGeneratedHeader(sourcePath, getEmittedModulePath(sourcePath))
    )));
    if (options.check) {
        assertEmittedModulesTracked(emittedPaths);
        assertEmittedModulesClean(emittedPaths);
    }
}

const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => arg !== "--check");
if (unknownArgs.length > 0) {
    console.error(`Unknown argument: ${unknownArgs[0]}`);
    process.exit(1);
}

try {
    await buildTypeScriptModules({ check: args.includes("--check") });
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
