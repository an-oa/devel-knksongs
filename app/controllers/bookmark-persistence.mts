import {
    buildStoredBookmarksPayload,
    migrateLegacyBookmarkSongRefsToCurrent,
    parseStoredBookmarksPayload
} from "../lib/storage/bookmark-schema.mjs";
import type { AppDataState } from "../state.types";

type BookmarkPersistenceInput = {
    data: Pick<AppDataState, "allSongsRaw" | "bookmarks">;
    constants: {
        storageKey: string;
        storageVersion: number;
    };
};

/**
 * ブックマーク本体の読込・保存と、曲データ反映後の参照移行を扱う controller を作成する。
 */
export function createBookmarkPersistenceController({
    data,
    constants
}: BookmarkPersistenceInput) {
    const { storageKey, storageVersion } = constants;
    let loadedStorageVersion = storageVersion;
    let hasUnsupportedFutureStorage = false;

    /**
     * ブックマーク移行デバッグログの有効状態を返す。
     */
    function isBookmarkMigrationDebugEnabled(): boolean {
        try {
            if (window.__KNK_DEBUG_BOOKMARK_MIGRATION__ === true) return true;
            return localStorage.getItem("debugBookmarkMigration") === "true";
        } catch {
            return false;
        }
    }

    /**
     * ブックマーク移行まわりのデバッグログを出力する。
     * @param message ログ本文
     * @param details 付加情報
     */
    function debugBookmarkMigration(message: string, details?: unknown): void {
        if (!isBookmarkMigrationDebugEnabled()) return;
        if (details === undefined) {
            console.debug("[bookmark-migration]", message);
            return;
        }
        console.debug("[bookmark-migration]", message, details);
    }

    /**
     * 現在のブックマークを現行 schema でローカルストレージへ保存する。
     */
    function saveBookmarks(): void {
        if (hasUnsupportedFutureStorage) {
            debugBookmarkMigration("bookmark save skipped for unsupported future payload", {
                storedVersion: loadedStorageVersion,
                currentVersion: storageVersion
            });
            return;
        }
        try {
            localStorage.setItem(
                storageKey,
                JSON.stringify(buildStoredBookmarksPayload(data.bookmarks, storageVersion))
            );
            loadedStorageVersion = storageVersion;
        } catch (error) {
            console.error("Failed to save bookmarks", error);
        }
    }

    /**
     * ブックマークをローカルストレージから state へ読み込む。
     */
    function loadBookmarksFromStorage(): void {
        try {
            const stored = localStorage.getItem(storageKey);
            loadedStorageVersion = storageVersion;
            hasUnsupportedFutureStorage = false;
            if (stored) {
                const parsed = parseStoredBookmarksPayload(JSON.parse(stored), storageVersion);
                loadedStorageVersion = parsed.version;
                if (!parsed.supported) {
                    data.bookmarks = {};
                    hasUnsupportedFutureStorage = true;
                    debugBookmarkMigration("unsupported future bookmarks payload preserved", {
                        storedVersion: parsed.version,
                        currentVersion: storageVersion
                    });
                    return;
                }
                data.bookmarks = parsed.bookmarks;
                hasUnsupportedFutureStorage = false;
                debugBookmarkMigration("loaded bookmarks payload", {
                    storedVersion: parsed.version,
                    bookmarkCount: Object.keys(parsed.bookmarks).length
                });
            }
        } catch (error) {
            console.error("Failed to load bookmarks", error);
            data.bookmarks = {};
            loadedStorageVersion = storageVersion;
            hasUnsupportedFutureStorage = false;
        }
    }

    /**
     * 読み込み済み曲データを使い、旧参照形式のブックマーク曲IDを現行形式へ移行する。
     */
    function migrateLegacyBookmarkSongRefs(): void {
        debugBookmarkMigration("start bookmark ref migration", {
            storedVersion: loadedStorageVersion,
            targetVersion: storageVersion,
            bookmarkCount: Object.keys(data.bookmarks).length,
            songRowCount: Array.isArray(data.allSongsRaw) ? data.allSongsRaw.length : 0
        });
        if (loadedStorageVersion >= storageVersion) {
            debugBookmarkMigration("bookmark ref migration skipped", {
                changedBookmarkIds: [],
                currentVersion: loadedStorageVersion
            });
            return;
        }
        const migration = migrateLegacyBookmarkSongRefsToCurrent({
            bookmarks: data.bookmarks,
            songRows: data.allSongsRaw
        });
        migration.changes.forEach((change) => {
            debugBookmarkMigration("bookmark refs migrated", change);
        });
        saveBookmarks();
        debugBookmarkMigration("saved migrated bookmarks payload", {
            changedBookmarkIds: migration.changedBookmarkIds,
            upgradedVersion: storageVersion
        });
    }

    return {
        loadBookmarksFromStorage,
        saveBookmarks,
        migrateLegacyBookmarkSongRefs
    };
}
