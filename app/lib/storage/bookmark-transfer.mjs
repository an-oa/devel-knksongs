import {
    buildStoredBookmarksPayload,
    migrateLegacyBookmarkSongRefsToCurrent,
    parseStoredBookmarksPayload
} from "./bookmark-schema.mjs?v=14";

/**
 * 成功時の共通レスポンスを組み立てる。
 * @param {*} extra
 * @returns {{ ok: true }}
 */
function buildActionOk(extra) {
    return { ok: true, ...(extra || {}) };
}

/**
 * 失敗理由付きの共通レスポンスを組み立てる。
 * @param {string} reason
 * @param {*} extra
 * @returns {{ ok: false, reason: string }}
 */
function buildActionFail(reason, extra) {
    return { ok: false, reason, ...(extra || {}) };
}

/**
 * ブックマーク内の合計曲数を数える。
 * @param {Record<string, { songs?: Array<*> }>} bookmarks
 * @returns {number}
 */
function countBookmarkSongs(bookmarks) {
    return Object.values(bookmarks).reduce((total, bookmark) => {
        return total + (Array.isArray(bookmark.songs) ? bookmark.songs.length : 0);
    }, 0);
}

/**
 * ブックマーク数と各ブックマーク内の曲数が上限内かを確認する。
 * @param {Record<string, { name: string, songs: Array<*> }>} bookmarks
 * @param {{ maxBookmarkCount?: number, maxSongsPerBookmark?: number }} limits
 * @returns {{ ok: boolean, reason?: string, limit?: number, bookmarkName?: string }}
 */
export function validateBookmarkImportLimits(bookmarks, limits) {
    const maxBookmarkCount = Number.isFinite(limits && limits.maxBookmarkCount)
        ? limits.maxBookmarkCount
        : Number.POSITIVE_INFINITY;
    const maxSongsPerBookmark = Number.isFinite(limits && limits.maxSongsPerBookmark)
        ? limits.maxSongsPerBookmark
        : Number.POSITIVE_INFINITY;
    const bookmarkEntries = Object.entries(bookmarks);
    if (bookmarkEntries.length > maxBookmarkCount) {
        return buildActionFail("max_bookmark_count", { limit: maxBookmarkCount });
    }
    for (const [, bookmark] of bookmarkEntries) {
        const songs = Array.isArray(bookmark.songs) ? bookmark.songs : [];
        if (songs.length > maxSongsPerBookmark) {
            return buildActionFail("max_songs_per_bookmark", {
                limit: maxSongsPerBookmark,
                bookmarkName: bookmark.name
            });
        }
    }
    return buildActionOk();
}

/**
 * インポート候補の JSON 文字列を解析し、全置き換え可能なブックマーク情報に整える。
 * @param {*} text
 * @param {{
 *   songRows?: Array<*>,
 *   maxBookmarkCount?: number,
 *   maxSongsPerBookmark?: number
 * }} options
 * @returns {{ ok: boolean, reason?: string, bookmarks?: Record<string, *>, bookmarkCount?: number, songCount?: number, limit?: number, bookmarkName?: string }}
 */
export function parseBookmarkImportText(text, options) {
    if (typeof text !== "string") return buildActionFail("invalid_text");

    let raw;
    try {
        raw = JSON.parse(text);
    } catch {
        return buildActionFail("invalid_json");
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return buildActionFail("invalid_bookmark_file");
    }

    const isVersionedPayload = Object.prototype.hasOwnProperty.call(raw, "bookmarks");
    const rawBookmarkMap = isVersionedPayload ? raw.bookmarks : raw;
    const rawEntryCount = rawBookmarkMap && typeof rawBookmarkMap === "object" && !Array.isArray(rawBookmarkMap)
        ? Object.keys(rawBookmarkMap).length
        : 0;
    if (isVersionedPayload && (!rawBookmarkMap || typeof rawBookmarkMap !== "object" || Array.isArray(rawBookmarkMap))) {
        return buildActionFail("invalid_bookmark_file");
    }

    const parsed = parseStoredBookmarksPayload(raw);
    const bookmarks = parsed.bookmarks;
    const bookmarkCount = Object.keys(bookmarks).length;
    if ((!isVersionedPayload || rawEntryCount > 0) && bookmarkCount === 0) {
        return buildActionFail("invalid_bookmark_file");
    }

    const songRows = Array.isArray(options && options.songRows) ? options.songRows : [];
    if (songRows.length > 0) {
        migrateLegacyBookmarkSongRefsToCurrent({
            bookmarks,
            songRows
        });
    }

    const limitCheck = validateBookmarkImportLimits(bookmarks, options);
    if (!limitCheck.ok) return limitCheck;

    return buildActionOk({
        bookmarks,
        bookmarkCount,
        songCount: countBookmarkSongs(bookmarks)
    });
}

/**
 * 現在のブックマークを JSON エクスポート用文字列へ変換する。
 * @param {Record<string, *>} bookmarks
 * @param {number} version
 * @returns {{ ok: boolean, text: string, bookmarkCount: number, songCount: number }}
 */
export function exportBookmarksAsJsonText(bookmarks, version) {
    const safeBookmarks = bookmarks && typeof bookmarks === "object" ? bookmarks : {};
    const payload = buildStoredBookmarksPayload(safeBookmarks, version);
    return buildActionOk({
        text: `${JSON.stringify(payload, null, 2)}\n`,
        bookmarkCount: Object.keys(safeBookmarks).length,
        songCount: countBookmarkSongs(safeBookmarks)
    });
}
