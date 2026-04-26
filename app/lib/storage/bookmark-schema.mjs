/**
 * 保存済みブックマーク構造を検証し、利用可能な形へ整形する。
 * @param {*} raw
 * @returns {Record<string, { name: string, createdAt: number, songs: Array<string | number> }>}
 */
export function sanitizeBookmarks(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const sanitized = {};
    for (const [id, bookmark] of Object.entries(raw)) {
        if (!bookmark || typeof bookmark !== "object" || Array.isArray(bookmark)) continue;
        const name = typeof bookmark.name === "string" ? bookmark.name.trim() : "";
        if (!name) continue;
        const createdAt = Number.isFinite(bookmark.createdAt) ? bookmark.createdAt : 0;
        const songs = [];
        const seen = new Set();
        const rawSongs = Array.isArray(bookmark.songs) ? bookmark.songs : [];
        rawSongs.forEach((ref) => {
            let normalized = null;
            if (typeof ref === "string") {
                const value = ref.trim();
                if (value) normalized = value;
            } else if (Number.isFinite(ref)) {
                normalized = ref;
            }
            if (normalized === null) return;
            const dedupeKey = typeof normalized === "number" ? `n:${normalized}` : `s:${normalized}`;
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            songs.push(normalized);
        });
        sanitized[id] = { name, createdAt, songs };
    }
    return sanitized;
}

/**
 * 保存済みブックマーク payload を解析し、version と本体を取り出す。
 * @param {*} raw
 * @returns {{ version: number, bookmarks: Record<string, { name: string, createdAt: number, songs: Array<string | number> }> }}
 */
export function parseStoredBookmarksPayload(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { version: 1, bookmarks: {} };
    }
    if (Object.prototype.hasOwnProperty.call(raw, "bookmarks")) {
        const version = Number.isFinite(raw.version) ? raw.version : 1;
        return {
            version,
            bookmarks: sanitizeBookmarks(raw.bookmarks)
        };
    }
    return {
        version: 1,
        bookmarks: sanitizeBookmarks(raw)
    };
}

/**
 * 現行形式のブックマーク保存 payload を組み立てる。
 * @param {*} bookmarks
 * @param {number} version
 * @returns {{ version: number, bookmarks: * }}
 */
export function buildStoredBookmarksPayload(bookmarks, version) {
    return { version, bookmarks };
}

/**
 * 行データからブックマーク保存に使う参照キーを返す。
 * @param {*} row
 * @returns {string}
 */
export function getBookmarkSongRefFromRow(row) {
    if (!row || typeof row !== "object") return "";
    if (typeof row.bookmarkSongKey === "string" && row.bookmarkSongKey.trim()) {
        return row.bookmarkSongKey.trim();
    }
    if (typeof row.songKey === "string" && row.songKey.trim()) {
        return row.songKey.trim();
    }
    return "";
}

/**
 * 旧形式の曲参照キーを現行の songKey 互換形式へ正規化する。
 * @param {*} ref
 * @returns {string | null}
 */
export function normalizeLegacySongRefToCurrent(ref) {
    if (typeof ref !== "string") return null;
    const parts = ref.split("::");
    if (parts.length < 2) return null;
    const archiveId = (parts[0] || "").trim();
    if (!archiveId) return null;
    const rawOrder = (parts[1] || "").trim();
    const parsedOrder = Number.parseInt(rawOrder, 10);
    const orderPart = Number.isFinite(parsedOrder) ? String(parsedOrder) : "";
    return [archiveId, orderPart].join("::");
}

/**
 * 旧参照形式のブックマーク曲IDを現行の bookmarkSongKey へ移行する。
 * @param {{ bookmarks: Record<string, *>, songRows: Array<*> }} input
 * @returns {{ updated: boolean, changedBookmarkIds: Array<string>, changes: Array<{ bookmarkId: string, before: Array<*>, after: Array<string> }> }}
 */
export function migrateLegacyBookmarkSongRefsToCurrent(input) {
    const bookmarks = input && input.bookmarks && typeof input.bookmarks === "object"
        ? input.bookmarks
        : {};
    const songRows = Array.isArray(input && input.songRows) ? input.songRows : [];
    const legacyIndexMap = new Map();
    const legacySongKeyMap = new Map();
    const songKeyMap = new Map();
    const bookmarkSongKeySet = new Set();
    const changedBookmarkIds = [];
    const changes = [];

    songRows.forEach((row) => {
        const bookmarkSongRef = getBookmarkSongRefFromRow(row);
        if (Number.isFinite(row && row.sourceIndex) && bookmarkSongRef) {
            legacyIndexMap.set(row.sourceIndex, bookmarkSongRef);
        }
        if (bookmarkSongRef) bookmarkSongKeySet.add(bookmarkSongRef);
        if (row && typeof row.songKey === "string" && row.songKey && bookmarkSongRef) {
            songKeyMap.set(row.songKey, bookmarkSongRef);
        }
        if (row && typeof row.legacySongKey === "string" && row.legacySongKey) {
            legacySongKeyMap.set(row.legacySongKey, bookmarkSongRef);
        }
    });

    let updated = false;
    Object.entries(bookmarks).forEach(([bookmarkId, bookmark]) => {
        const nextSongs = [];
        const seen = new Set();
        const prevSongs = Array.isArray(bookmark && bookmark.songs) ? bookmark.songs : [];
        prevSongs.forEach((ref) => {
            let normalized = null;
            if (typeof ref === "string") {
                const trimmedRef = ref.trim();
                if (bookmarkSongKeySet.has(trimmedRef)) normalized = trimmedRef;
                else if (songKeyMap.has(trimmedRef)) normalized = songKeyMap.get(trimmedRef) || null;
                else if (legacySongKeyMap.has(trimmedRef)) normalized = legacySongKeyMap.get(trimmedRef) || null;
                else {
                    const converted = normalizeLegacySongRefToCurrent(trimmedRef);
                    if (converted && songKeyMap.has(converted)) normalized = songKeyMap.get(converted) || null;
                }
            } else if (Number.isFinite(ref)) {
                normalized = legacyIndexMap.get(ref) || null;
            }
            if (!normalized) return;
            if (seen.has(normalized)) return;
            seen.add(normalized);
            nextSongs.push(normalized);
        });
        if (prevSongs.length !== nextSongs.length || prevSongs.some((ref, idx) => ref !== nextSongs[idx])) {
            bookmark.songs = nextSongs;
            updated = true;
            changedBookmarkIds.push(bookmarkId);
            changes.push({ bookmarkId, before: prevSongs, after: nextSongs });
        }
    });

    return { updated, changedBookmarkIds, changes };
}
