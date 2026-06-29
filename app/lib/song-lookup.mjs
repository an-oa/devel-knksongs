/** @typedef {import("../state.types").LookupUiRuntimeState} LookupUiRuntimeState */

/**
 * 曲参照用の検索マップが最新の曲配列を指しているかを返す。
 * @param {LookupUiRuntimeState} lookupUi
 * @param {Song[]} songRows
 * @returns {boolean}
 */
function hasCurrentSongLookupMaps(lookupUi, songRows) {
    return lookupUi.songLookupSourceRef === songRows &&
        lookupUi.songMapByBookmarkKey instanceof Map &&
        lookupUi.songMapByKey instanceof Map &&
        lookupUi.songMapByLegacyIndex instanceof Map;
}

/**
 * 曲参照用の検索マップを必要時に再構築する。
 * 本番コードでは検索/ブックマーク通知の参照解決から使い、境界条件を単体テストするため export している。
 * @param {LookupUiRuntimeState} lookupUi
 * @param {Song[]} songRows
 */
export function ensureSongLookupMaps(lookupUi, songRows) {
    const rows = Array.isArray(songRows) ? songRows : [];
    if (hasCurrentSongLookupMaps(lookupUi, rows)) return;

    lookupUi.songMapByBookmarkKey = new Map();
    lookupUi.songMapByKey = new Map(rows.map((row) => [row.songKey, row]));
    rows.forEach((row) => {
        if (typeof row.bookmarkSongKey === "string" && row.bookmarkSongKey) {
            lookupUi.songMapByBookmarkKey.set(row.bookmarkSongKey, row);
        }
    });
    lookupUi.songMapByLegacyIndex = new Map(rows.map((row) => [row.sourceIndex, row]));
    lookupUi.songLookupSourceRef = rows;
}

/**
 * 曲参照から曲データを返す。
 * @param {LookupUiRuntimeState} lookupUi
 * @param {Song[]} songRows
 * @param {string | number | null | undefined} songRef
 * @returns {Song | null}
 */
export function resolveSongRef(lookupUi, songRows, songRef) {
    ensureSongLookupMaps(lookupUi, songRows);
    if (typeof songRef === "string") {
        return lookupUi.songMapByBookmarkKey.get(songRef) || lookupUi.songMapByKey.get(songRef) || null;
    }
    if (typeof songRef === "number" && Number.isFinite(songRef)) {
        return lookupUi.songMapByLegacyIndex.get(songRef) || null;
    }
    return null;
}

/**
 * ブックマーク内の曲参照配列を曲データ配列へ解決する。
 * @param {LookupUiRuntimeState} lookupUi
 * @param {Song[]} songRows
 * @param {Array<string | number> | null | undefined} songRefs
 * @returns {Song[]}
 */
export function resolveSongRefs(lookupUi, songRows, songRefs) {
    const refs = Array.isArray(songRefs) ? songRefs : [];
    /** @type {Song[]} */
    const resolvedSongs = [];
    refs.forEach((songRef) => {
        const song = resolveSongRef(lookupUi, songRows, songRef);
        if (song) resolvedSongs.push(song);
    });
    return resolvedSongs;
}
