import {
    buildStoredBookmarksPayload,
    migrateLegacyBookmarkSongRefsToCurrent,
    parseStoredBookmarksPayload
} from "./bookmark-schema.mjs";

/** ファイル読み込みと JSON 解析の前に適用する UTF-8 バイト数の上限。 */
export const MAX_BOOKMARK_IMPORT_BYTES = 1_000_000;

/** 巨大な文字列の複製を避けながら、インポート上限をUTF-8バイト数で確認する。 */
function isWithinBookmarkImportSize(text: string): boolean {
    return text.length <= MAX_BOOKMARK_IMPORT_BYTES &&
        new TextEncoder().encode(text).byteLength <= MAX_BOOKMARK_IMPORT_BYTES;
}

type BookmarkImportEntry = {
    name: string;
    songs: string[];
};

type BookmarkImportLimits = {
    maxBookmarkCount?: number;
    maxSongsPerBookmark?: number;
    maxBookmarkNameLength?: number;
};

type BookmarkImportOptions = BookmarkImportLimits & {
    songRows?: Array<Record<string, unknown>>;
    storageVersion: number;
};

/** インポート上限に達した理由と、その理由に対応する補足情報。 */
type BookmarkImportLimitFailure =
    | { ok: false; reason: "max_bookmark_count" | "max_bookmark_name_length"; limit: number }
    | { ok: false; reason: "max_songs_per_bookmark"; limit: number; bookmarkName: string };

/** インポート失敗時に呼び出し元へ返す理由別の結果。 */
type BookmarkImportFailure =
    | BookmarkImportLimitFailure
    | { ok: false; reason: "invalid_text" | "invalid_json" | "invalid_bookmark_file" }
    | { ok: false; reason: "max_import_file_size"; limit: number }
    | { ok: false; reason: "unsupported_version"; version: number };

/** 検証済みブックマーク、または理由で判別できるインポート失敗。 */
type BookmarkImportResult =
    | {
        ok: true;
        bookmarks: ReturnType<typeof buildStoredBookmarksPayload>["bookmarks"];
        bookmarkCount: number;
        songCount: number;
    }
    | BookmarkImportFailure;

/** 手元とインポート候補の照合に使う、ブックマーク 1 件の内容。 */
type TransferBookmark = {
    name: string;
    songs: string[];
    createdAt?: number;
};

/** 同じ ID のブックマークを上書きしたときに変わる内容。 */
export type BookmarkImportChanges = {
    /** ファイルにだけある曲の数。 */
    addedSongCount: number;
    /** 手元にだけある曲の数。上書きすると消える。 */
    removedSongCount: number;
    /** 両方にある曲の並び順が変わるかどうか。 */
    orderChanged: boolean;
    /** 名前が変わる場合の手元の名前。変わらない場合は null。 */
    previousName: string | null;
};

/**
 * 手元とインポート候補の関係。同じ ID は同じブックマークの別の版として扱う。
 * 上書きのときだけ変更内容を持ち、表示と件数の数え方が食い違わないようにする。
 */
export type BookmarkImportRelation =
    | { status: "new"; changes: null }
    | { status: "unchanged"; changes: null }
    | { status: "update"; changes: BookmarkImportChanges };

/** インポート確認画面に並べる、ファイル内のブックマーク 1 件分の情報。 */
export type BookmarkImportPreviewEntry = {
    id: string;
    name: string;
    songCount: number;
    /** 新規の候補と同じ名前のブックマークが手元にあるかどうか。 */
    hasSameNameBookmark: boolean;
} & BookmarkImportRelation;

/** 選んだインポート候補を手元へ反映した結果、または上限による失敗。 */
type BookmarkMergeResult =
    | {
        ok: true;
        bookmarks: ReturnType<typeof buildStoredBookmarksPayload>["bookmarks"];
        addedIds: string[];
        updatedIds: string[];
    }
    | { ok: false; reason: "import_exceeds_bookmark_count"; limit: number; available: number }
    | { ok: false; reason: "import_exceeds_total_size"; limit: number };

/**
 * ブックマーク内の合計曲数を数える。
 * @param {Record<string, { songs?: Array<*> }>} bookmarks
 * @returns {number}
 */
function countBookmarkSongs(bookmarks: Record<string, { songs?: unknown }>) {
    return Object.values(bookmarks).reduce((total, bookmark) => {
        return total + (Array.isArray(bookmark.songs) ? bookmark.songs.length : 0);
    }, 0);
}

/**
 * ブックマーク数、名前の長さ、各ブックマーク内の曲数が上限内かを確認する。
 * @param {Record<string, BookmarkImportEntry>} bookmarks
 * @param {BookmarkImportLimits | undefined} limits
 */
function validateBookmarkImportLimits(
    bookmarks: Record<string, BookmarkImportEntry>,
    limits: BookmarkImportLimits | undefined
): { ok: true } | BookmarkImportLimitFailure {
    const maxBookmarkCount = typeof limits?.maxBookmarkCount === "number" && Number.isFinite(limits.maxBookmarkCount)
        ? limits.maxBookmarkCount
        : Number.POSITIVE_INFINITY;
    const maxSongsPerBookmark = typeof limits?.maxSongsPerBookmark === "number" && Number.isFinite(limits.maxSongsPerBookmark)
        ? limits.maxSongsPerBookmark
        : Number.POSITIVE_INFINITY;
    const maxBookmarkNameLength = typeof limits?.maxBookmarkNameLength === "number" && Number.isFinite(limits.maxBookmarkNameLength)
        ? limits.maxBookmarkNameLength
        : Number.POSITIVE_INFINITY;
    const bookmarkEntries = Object.entries(bookmarks);
    if (bookmarkEntries.length > maxBookmarkCount) {
        return { ok: false, reason: "max_bookmark_count", limit: maxBookmarkCount };
    }
    for (const [, bookmark] of bookmarkEntries) {
        if (typeof bookmark.name === "string" && bookmark.name.length > maxBookmarkNameLength) {
            return { ok: false, reason: "max_bookmark_name_length", limit: maxBookmarkNameLength };
        }
        const songs = Array.isArray(bookmark.songs) ? bookmark.songs : [];
        if (songs.length > maxSongsPerBookmark) {
            return {
                ok: false,
                reason: "max_songs_per_bookmark",
                limit: maxSongsPerBookmark,
                bookmarkName: bookmark.name
            };
        }
    }
    return { ok: true };
}

/**
 * インポート候補の JSON 文字列を解析し、全置き換え可能なブックマーク情報に整える。
 */
export function parseBookmarkImportText(
    text: unknown,
    options: BookmarkImportOptions
): BookmarkImportResult {
    if (typeof text !== "string") return { ok: false, reason: "invalid_text" };
    if (!isWithinBookmarkImportSize(text)) {
        return { ok: false, reason: "max_import_file_size", limit: MAX_BOOKMARK_IMPORT_BYTES };
    }

    let raw;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, reason: "invalid_json" };
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, reason: "invalid_bookmark_file" };
    }

    const payload = raw as { bookmarks?: unknown };
    const isVersionedPayload = Object.prototype.hasOwnProperty.call(payload, "bookmarks");
    const rawBookmarkMap = isVersionedPayload ? payload.bookmarks : raw;
    const rawEntryCount = rawBookmarkMap && typeof rawBookmarkMap === "object" && !Array.isArray(rawBookmarkMap)
        ? Object.keys(rawBookmarkMap).length
        : 0;
    if (isVersionedPayload && (!rawBookmarkMap || typeof rawBookmarkMap !== "object" || Array.isArray(rawBookmarkMap))) {
        return { ok: false, reason: "invalid_bookmark_file" };
    }

    const parsed = parseStoredBookmarksPayload(raw, options.storageVersion);
    if (!parsed.supported) {
        return { ok: false, reason: "unsupported_version", version: parsed.version };
    }
    const bookmarks = parsed.bookmarks;
    const bookmarkCount = Object.keys(bookmarks).length;
    if ((!isVersionedPayload || rawEntryCount > 0) && bookmarkCount === 0) {
        return { ok: false, reason: "invalid_bookmark_file" };
    }

    const songRows = Array.isArray(options?.songRows) ? options.songRows : [];
    if (songRows.length > 0) {
        migrateLegacyBookmarkSongRefsToCurrent({
            bookmarks,
            songRows
        });
    }

    const limitCheck = validateBookmarkImportLimits(bookmarks, options);
    if (limitCheck.ok === false) return limitCheck;
    // 旧形式の正規化・曲参照移行で増えた分も確認し、取り込み直後の再入出力を可能にする。
    if (!isWithinBookmarkImportSize(JSON.stringify({ version: options.storageVersion, bookmarks }))) {
        return { ok: false, reason: "max_import_file_size", limit: MAX_BOOKMARK_IMPORT_BYTES };
    }

    return {
        ok: true,
        bookmarks,
        bookmarkCount,
        songCount: countBookmarkSongs(bookmarks)
    };
}

/**
 * 同じ ID の手元とインポート候補を比べ、上書きで変わる内容を返す。中身が同じなら null を返す。
 * @param current 手元のブックマーク
 * @param imported ファイル内のブックマーク
 */
function compareImportedBookmark(
    current: TransferBookmark,
    imported: TransferBookmark
): BookmarkImportChanges | null {
    const currentSongs = new Set(current.songs);
    const importedSongs = new Set(imported.songs);
    const addedSongCount = imported.songs.filter((ref) => !currentSongs.has(ref)).length;
    const removedSongCount = current.songs.filter((ref) => !importedSongs.has(ref)).length;
    const sharedInImportedOrder = imported.songs.filter((ref) => currentSongs.has(ref));
    const sharedInCurrentOrder = current.songs.filter((ref) => importedSongs.has(ref));
    const orderChanged = sharedInImportedOrder.some((ref, index) => ref !== sharedInCurrentOrder[index]);
    const previousName = current.name === imported.name ? null : current.name;
    if (addedSongCount === 0 && removedSongCount === 0 && !orderChanged && previousName === null) {
        return null;
    }
    return { addedSongCount, removedSongCount, orderChanged, previousName };
}

/**
 * インポート候補を手元のブックマークと ID で照合し、確認画面に並べる情報を作成日時順で返す。
 * 名前は照合に使わず、新規の候補と同じ名前が手元にあることだけを知らせる。
 * @param current 手元のブックマーク
 * @param imported 検証済みのインポート候補
 */
export function buildBookmarkImportPreviewEntries(
    current: Record<string, TransferBookmark>,
    imported: Record<string, TransferBookmark>
): BookmarkImportPreviewEntry[] {
    const currentNames = new Set(Object.values(current).map((bookmark) => bookmark.name));
    return Object.entries(imported)
        .map(([id, bookmark], index) => {
            const exists = Object.hasOwn(current, id);
            const changes = exists ? compareImportedBookmark(current[id], bookmark) : null;
            const relation: BookmarkImportRelation = !exists
                ? { status: "new", changes: null }
                : changes ? { status: "update", changes } : { status: "unchanged", changes: null };
            const entry: BookmarkImportPreviewEntry = {
                id,
                name: bookmark.name,
                songCount: bookmark.songs.length,
                hasSameNameBookmark: relation.status === "new" && currentNames.has(bookmark.name),
                ...relation
            };
            return { index, createdAt: bookmark.createdAt ?? 0, entry };
        })
        .sort((a, b) => a.createdAt - b.createdAt || a.index - b.index)
        .map(({ entry }) => entry);
}

/**
 * 選んだインポート候補を ID で照合して手元へ反映する。
 * 同じ ID は名前と曲をファイルの版で上書きし、一覧での位置を保つため手元の作成日時を残す。
 * 新しい ID はファイルの ID のまま追加し、以降の更新でも同じブックマークとして照合できるようにする。
 * 中身が同じ候補と選ばれていない候補は変えない。追加後の件数と、取り込み直後の再入出力に必要な大きさも確認する。
 */
export function mergeImportedBookmarks({
    current,
    imported,
    selectedIds,
    storageVersion,
    maxBookmarkCount
}: {
    current: Record<string, TransferBookmark>;
    imported: Record<string, TransferBookmark>;
    selectedIds: readonly string[];
    storageVersion: number;
    maxBookmarkCount: number;
}): BookmarkMergeResult {
    const selected = new Set(selectedIds);
    const updates = new Map<string, TransferBookmark>();
    const additions: Array<[string, TransferBookmark]> = [];
    for (const [id, bookmark] of Object.entries(imported)) {
        if (!selected.has(id)) continue;
        if (!Object.hasOwn(current, id)) {
            additions.push([id, { ...bookmark, songs: bookmark.songs.slice() }]);
            continue;
        }
        const local = current[id];
        if (!compareImportedBookmark(local, bookmark)) continue;
        updates.set(id, {
            name: bookmark.name,
            songs: bookmark.songs.slice(),
            createdAt: Number.isFinite(local.createdAt) ? local.createdAt : bookmark.createdAt
        });
    }

    const currentCount = Object.keys(current).length;
    if (additions.length > 0 && currentCount + additions.length > maxBookmarkCount) {
        return {
            ok: false,
            reason: "import_exceeds_bookmark_count",
            limit: maxBookmarkCount,
            available: Math.max(0, maxBookmarkCount - currentCount)
        };
    }

    // __proto__ の ID も prototype を変えず通常のプロパティとして残すため、組み立ては Object.fromEntries で行う。
    const merged = Object.fromEntries([
        ...Object.entries(current).map(([id, bookmark]) => [id, updates.get(id) ?? bookmark] as const),
        ...additions
    ]);
    const payload = buildStoredBookmarksPayload(merged, storageVersion);
    if (!isWithinBookmarkImportSize(JSON.stringify(payload))) {
        return { ok: false, reason: "import_exceeds_total_size", limit: MAX_BOOKMARK_IMPORT_BYTES };
    }
    return {
        ok: true,
        bookmarks: payload.bookmarks,
        addedIds: additions.map(([id]) => id),
        updatedIds: [...updates.keys()]
    };
}

/**
 * 現在のブックマークを JSON エクスポート用文字列へ変換する。
 * 整形でインポート上限を超える場合は、再取り込みできるよう空白と末尾改行を省く。
 */
export function exportBookmarksAsJsonText(
    bookmarks: unknown,
    version: number
): { ok: true; text: string; bookmarkCount: number; songCount: number } {
    const safeBookmarks = bookmarks && typeof bookmarks === "object" ? bookmarks : {};
    const payload = buildStoredBookmarksPayload(safeBookmarks, version);
    const formattedText = `${JSON.stringify(payload, null, 2)}\n`;
    return {
        ok: true,
        text: isWithinBookmarkImportSize(formattedText) ? formattedText : JSON.stringify(payload),
        bookmarkCount: Object.keys(payload.bookmarks).length,
        songCount: countBookmarkSongs(payload.bookmarks)
    };
}
