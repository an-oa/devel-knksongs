import { createHash } from "node:crypto";

/**
 * 曲データ配列の内容ハッシュを生成する。
 */
export function createSongsContentHash(songs: unknown[]): string {
    return `sha256:${createHash("sha256").update(JSON.stringify(songs)).digest("hex")}`;
}
