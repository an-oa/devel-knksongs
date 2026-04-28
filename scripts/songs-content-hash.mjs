import { createHash } from "node:crypto";

/**
 * 曲データ配列の内容ハッシュを生成する。
 * @param {unknown[]} songs
 * @returns {string}
 */
export function createSongsContentHash(songs) {
    return `sha256:${createHash("sha256").update(JSON.stringify(songs)).digest("hex")}`;
}
