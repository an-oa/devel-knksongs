#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateSongsJsonArtifacts } from "./songs-json-artifact.mts";

const DEFAULT_INPUT_PATH = "data/songs.json";
const DEFAULT_META_INPUT_PATH = "data/songs-meta.json";

/**
 * CLI引数を2つの派生JSON入力パスへ変換する。
 * @param args CLI引数
 */
function parseArgs(args: string[]): { inputPath: string, metaInputPath: string } {
    const options = {
        inputPath: DEFAULT_INPUT_PATH,
        metaInputPath: DEFAULT_META_INPUT_PATH
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        const next = args[index + 1];
        if (arg === "--input") {
            if (!next) throw new Error("--input requires a file path");
            options.inputPath = next;
            index += 1;
            continue;
        }
        if (arg === "--meta-input") {
            if (!next) throw new Error("--meta-input requires a file path");
            options.metaInputPath = next;
            index += 1;
            continue;
        }
        throw new Error(
            "Usage: node scripts/validate-songs-json.mts " +
            "[--input data/songs.json] [--meta-input data/songs-meta.json]"
        );
    }
    return options;
}

/**
 * CSVから生成された2つのJSONファイルを読み込み、派生成果物としての整合性を検証する。
 * @param options 入力ファイル
 * @returns 収録曲数
 */
export async function validateSongsJsonFiles(options: { inputPath: string, metaInputPath: string }): Promise<number> {
    const [songsJsonText, songsMetaJsonText] = await Promise.all([
        readFile(resolve(options.inputPath), "utf8"),
        readFile(resolve(options.metaInputPath), "utf8")
    ]);
    return validateSongsJsonArtifacts(songsJsonText, songsMetaJsonText);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const options = parseArgs(process.argv.slice(2));
        const count = await validateSongsJsonFiles(options);
        console.log(`Validated ${options.inputPath} and ${options.metaInputPath} (${count} songs)`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
