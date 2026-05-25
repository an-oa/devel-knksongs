#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSongsJsonPayload } from "../app/lib/songs-json.mjs";
import { extractYoutubeInfo } from "../app/lib/youtube-url.mjs";

const DEFAULT_INPUT_PATH = "data/songs.json";
const ALLOWED_YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be"
]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * 値を曲データ検証用の表示文字列へ整形する。
 * @param {unknown} value
 * @returns {string}
 */
function formatIssueValue(value) {
    if (value === undefined) return "undefined";
    return JSON.stringify(value);
}

/**
 * 曲データの場所をエラーメッセージ用に整形する。
 * @param {unknown} song
 * @param {number} index
 * @returns {string}
 */
function formatSongLocation(song, index) {
    const title = song && typeof song === "object" && typeof song.title === "string"
        ? song.title.trim()
        : "";
    return title ? `songs[${index}] ${title}` : `songs[${index}]`;
}

/**
 * URL文字列から host を抽出する。
 * @param {unknown} url
 * @returns {string}
 */
function parseUrlHost(url) {
    try {
        return new URL(String(url)).hostname;
    } catch {
        return "";
    }
}

/**
 * 曲データの文字列フィールドが空でないことを検証する。
 * @param {Record<string, unknown>} song
 * @param {number} index
 * @param {string[]} issues
 */
function validateRequiredTextFields(song, index, issues) {
    for (const fieldName of ["title", "artist", "url"]) {
        if (typeof song[fieldName] !== "string" || song[fieldName].trim() === "") {
            issues.push(`${formatSongLocation(song, index)}: ${fieldName} must not be empty`);
        }
    }
}

/**
 * 曲データのURLとYouTube IDを検証する。
 * 単体テストで境界条件を確認するために export しているが、本番コードでは
 * validateSongsDataQuality 経由で使う helper。
 * @param {Record<string, unknown>} song
 * @param {number} index
 * @param {string[]} issues
 * @returns {{ videoId: string, startSeconds: number }}
 */
export function validateSongYoutubeFields(song, index, issues) {
    const host = parseUrlHost(song.url);
    if (!ALLOWED_YOUTUBE_HOSTS.has(host)) {
        issues.push(`${formatSongLocation(song, index)}: url host must be a supported YouTube host`);
    }

    const youtubeInfo = extractYoutubeInfo(typeof song.url === "string" ? song.url : "");
    if (!YOUTUBE_VIDEO_ID_PATTERN.test(youtubeInfo.videoId)) {
        issues.push(
            `${formatSongLocation(song, index)}: extracted videoId must match ${YOUTUBE_VIDEO_ID_PATTERN}`
        );
    }
    if (!Number.isFinite(youtubeInfo.startSeconds) || youtubeInfo.startSeconds < 0) {
        issues.push(
            `${formatSongLocation(song, index)}: startSeconds must be a finite number greater than or equal to 0`
        );
    }
    return youtubeInfo;
}

/**
 * 曲データの終了秒数を検証する。
 * @param {Record<string, unknown>} song
 * @param {number} index
 * @param {number} startSeconds
 * @param {string[]} issues
 */
function validateEndSeconds(song, index, startSeconds, issues) {
    if (song.endSeconds === null || song.endSeconds === undefined) return;
    if (typeof song.endSeconds !== "number" ||
        !Number.isFinite(song.endSeconds) ||
        song.endSeconds < 0) {
        issues.push(
            `${formatSongLocation(song, index)}: endSeconds must be a finite number greater than or equal to 0`
        );
        return;
    }
    if (song.endSeconds <= startSeconds) {
        issues.push(`${formatSongLocation(song, index)}: endSeconds must be greater than startSeconds`);
    }
}

/**
 * 生成済み曲データの品質条件を検証する。
 * @param {unknown[]} songs
 * @returns {string[]}
 */
export function validateSongsDataQuality(songs) {
    const issues = [];
    for (let index = 0; index < songs.length; index += 1) {
        const song = songs[index];
        if (!song || typeof song !== "object" || Array.isArray(song)) {
            issues.push(`songs[${index}]: song must be an object, got ${formatIssueValue(song)}`);
            continue;
        }
        validateRequiredTextFields(song, index, issues);
        const youtubeInfo = validateSongYoutubeFields(song, index, issues);
        validateEndSeconds(song, index, youtubeInfo.startSeconds, issues);
    }
    return issues;
}

/**
 * CLI 引数を入力ファイルパスへ変換する。
 * @param {string[]} args
 * @returns {string}
 */
function parseArgs(args) {
    if (args.length === 0) return DEFAULT_INPUT_PATH;
    if (args.length === 2 && args[0] === "--input") return args[1];
    throw new Error("Usage: node scripts/validate-songs-json.mjs [--input data/songs.json]");
}

/**
 * 曲データJSONを読み込み、品質条件を検証する。
 * @param {string} inputPath
 * @returns {Promise<number>}
 */
async function validateSongsJsonFile(inputPath) {
    const jsonText = await readFile(resolve(inputPath), "utf8");
    const { songs } = parseSongsJsonPayload(jsonText);
    const issues = validateSongsDataQuality(songs);
    if (issues.length > 0) {
        throw new Error(`songs json validation failed:\n${issues.join("\n")}`);
    }
    return songs.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const inputPath = parseArgs(process.argv.slice(2));
        const count = await validateSongsJsonFile(inputPath);
        console.log(`Validated ${inputPath} (${count} songs)`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
