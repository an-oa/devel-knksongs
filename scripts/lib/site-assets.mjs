export const ROOT_ASSET_FILES = ["index.html", "styles.css", "ogp.png"];
export const DATA_ASSET_FILES = ["songs.json", "songs-meta.json"];

const TYPESCRIPT_SOURCE_EXTENSIONS = [".ts", ".mts", ".tsx", ".cts"];

/**
 * Pages artifact へコピーする app asset かを返す。
 * TypeScript source は build:ts で生成した .mjs を配布対象にするため除外する。
 * @param {string} sourcePath
 * @returns {boolean}
 */
export function shouldCopyAppAsset(sourcePath) {
    return !TYPESCRIPT_SOURCE_EXTENSIONS.some((extension) => sourcePath.endsWith(extension));
}
