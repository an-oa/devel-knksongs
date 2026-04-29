import { getDateUiState, getSearchUiState } from "../lib/ui-slices.mjs?v=14";
import {
    buildStoredBookmarksPayload,
    migrateLegacyBookmarkSongRefsToCurrent,
    parseStoredBookmarksPayload
} from "../lib/storage/bookmark-schema.mjs?v=14";

/**
 * ブックマークと検索状態の保存・復元を扱うストレージコントローラーを作成する。
 * @param {*} ui
 * @param {*} constants
 */
export function createStorageController({ data, ui, constants, callbacks }) {
    const searchUi = getSearchUiState(ui);
    const dateUi = getDateUiState(ui);
    const {
        DEFAULT_FORMATS,
        SEARCH_STATE_KEY,
        BOOKMARK_STORAGE_KEY,
        BOOKMARK_STORAGE_VERSION = 1,
        MAX_BOOKMARK_COUNT = Number.POSITIVE_INFINITY,
        MAX_SONGS_PER_BOOKMARK = Number.POSITIVE_INFINITY
    } = constants;
    const {
        getDateSelectValue,
        applyPendingDateValues,
        renderBookmarks,
        scheduleSearch
    } = callbacks;
    let loadedBookmarkStorageVersion = BOOKMARK_STORAGE_VERSION;

    /**
     * ブックマーク移行デバッグログの有効状態を返す。
     * @returns {boolean}
     */
    function isBookmarkMigrationDebugEnabled() {
        try {
            if (window.__KNK_DEBUG_BOOKMARK_MIGRATION__ === true) return true;
            return localStorage.getItem("debugBookmarkMigration") === "true";
        } catch {
            return false;
        }
    }

    /**
     * ブックマーク移行まわりのデバッグログを出力する。
     * @param {string} message
     * @param {*} details
     */
    function debugBookmarkMigration(message, details) {
        if (!isBookmarkMigrationDebugEnabled()) return;
        if (details === undefined) {
            console.debug("[bookmark-migration]", message);
            return;
        }
        console.debug("[bookmark-migration]", message, details);
    }

    /**
     * 選択中フォーマットを既定値に戻す。
     */
    function setSelectedFormatsToDefault() {
        searchUi.selectedFormats.clear();
        DEFAULT_FORMATS.forEach((f) => searchUi.selectedFormats.add(f));
    }

    /**
     * state上のフォーマット選択状態をチェックボックスへ同期する。
     */
    function syncFormatCheckboxesFromState() {
        const formatCheckboxes = document.querySelectorAll('#formatsList input[type="checkbox"]');
        formatCheckboxes.forEach((cb) => {
            cb.checked = searchUi.selectedFormats.has(cb.value);
        });
    }

    /**
     * 保存値からフォーマット選択を復元し、不正値を除外する。
     * @param {*} rawFormats
     */
    function applySelectedFormatsFromRaw(rawFormats) {
        const formats = Array.isArray(rawFormats) ? rawFormats : [];
        const allowed = new Set(DEFAULT_FORMATS);
        searchUi.selectedFormats.clear();
        formats.forEach((f) => {
            if (allowed.has(f)) searchUi.selectedFormats.add(f);
        });
        if (searchUi.selectedFormats.size === 0) {
            setSelectedFormatsToDefault();
        }
    }

    /**
     * 成功時の共通レスポンスを組み立てる。
     * @param {*} extra
     */
    function buildActionOk(extra) {
        return { ok: true, ...(extra || {}) };
    }

    /**
     * 失敗理由付きの共通レスポンスを組み立てる。
     * @param {*} reason
     * @param {*} extra
     */
    function buildActionFail(reason, extra) {
        return { ok: false, reason, ...(extra || {}) };
    }

    /**
     * ブックマーク情報をローカルストレージへ保存する。
     */
    function saveBookmarks() {
        try {
            localStorage.setItem(
                BOOKMARK_STORAGE_KEY,
                JSON.stringify(buildStoredBookmarksPayload(data.bookmarks, BOOKMARK_STORAGE_VERSION))
            );
            loadedBookmarkStorageVersion = BOOKMARK_STORAGE_VERSION;
        } catch (e) {
            console.error("Failed to save bookmarks", e);
        }
    }

    /**
     * ブックマーク情報をローカルストレージから読み込み、描画を更新する。
     */
    function loadBookmarks() {
        try {
            const stored = localStorage.getItem(BOOKMARK_STORAGE_KEY);
            if (stored) {
                const parsed = parseStoredBookmarksPayload(JSON.parse(stored));
                data.bookmarks = parsed.bookmarks;
                loadedBookmarkStorageVersion = parsed.version;
                debugBookmarkMigration("loaded bookmarks payload", {
                    storedVersion: parsed.version,
                    bookmarkCount: Object.keys(parsed.bookmarks).length
                });
            }
        } catch (e) {
            console.error("Failed to load bookmarks", e);
            data.bookmarks = {};
        }
        renderBookmarks();
    }

    /**
     * 旧参照形式のブックマーク曲IDを現行の `bookmarkSongKey` へ移行する。
     */
    function migrateLegacyBookmarkSongRefs() {
        debugBookmarkMigration("start bookmark ref migration", {
            storedVersion: loadedBookmarkStorageVersion,
            targetVersion: BOOKMARK_STORAGE_VERSION,
            bookmarkCount: Object.keys(data.bookmarks).length,
            songRowCount: Array.isArray(data.allSongsRaw) ? data.allSongsRaw.length : 0
        });
        const migration = migrateLegacyBookmarkSongRefsToCurrent({
            bookmarks: data.bookmarks,
            songRows: data.allSongsRaw
        });
        migration.changes.forEach((change) => {
            debugBookmarkMigration("bookmark refs migrated", change);
        });
        if (migration.updated || loadedBookmarkStorageVersion !== BOOKMARK_STORAGE_VERSION) {
            saveBookmarks();
            debugBookmarkMigration("saved migrated bookmarks payload", {
                changedBookmarkIds: migration.changedBookmarkIds,
                upgradedVersion: BOOKMARK_STORAGE_VERSION
            });
            return;
        }
        debugBookmarkMigration("bookmark ref migration skipped", {
            changedBookmarkIds: [],
            currentVersion: loadedBookmarkStorageVersion
        });
    }

    /**
     * 指定ブックマークから曲を削除し、必要なら検索結果を更新する。
     * @param {*} bookmarkId
     * @param {*} songKey
     */
    function removeSongFromBookmark(bookmarkId, songKey) {
        const bookmark = data.bookmarks[bookmarkId];
        if (!bookmark) return;

        const songIndex = bookmark.songs.indexOf(songKey);
        if (songIndex > -1) {
            bookmark.songs.splice(songIndex, 1);
            saveBookmarks();
            renderBookmarks();
            if (data.activeBookmark === bookmarkId) {
                scheduleSearch({ immediate: true });
            }
        }
    }

    /**
     * 指定ブックマークへ曲を追加し、上限や重複を検証して結果を返す。
     * @param {*} bookmarkId
     * @param {*} songKey
     */
    function addSongToBookmark(bookmarkId, songKey) {
        const bookmark = data.bookmarks[bookmarkId];
        if (!bookmark) return buildActionFail("bookmark_not_found");
        if (bookmark.songs.includes(songKey)) return buildActionFail("duplicate_song");
        if (bookmark.songs.length >= MAX_SONGS_PER_BOOKMARK) {
            return buildActionFail("max_songs_per_bookmark", { limit: MAX_SONGS_PER_BOOKMARK });
        }
        bookmark.songs.push(songKey);
        saveBookmarks();
        renderBookmarks();
        if (data.activeBookmark === bookmarkId) {
            scheduleSearch({ immediate: true });
        }
        return buildActionOk();
    }

    /**
     * 新規ブックマークを作成する共通処理。
     * @param {*} bookmarkName
     * @param {Array<string>} initialSongs
     */
    function createBookmarkRecord(bookmarkName, initialSongs) {
        if (Object.keys(data.bookmarks).length >= MAX_BOOKMARK_COUNT) {
            return buildActionFail("max_bookmark_count", { limit: MAX_BOOKMARK_COUNT });
        }
        if (typeof bookmarkName !== "string") return buildActionFail("invalid_name_type");
        const trimmedName = bookmarkName.trim();
        if (!trimmedName) return buildActionFail("empty_name");
        const now = Date.now();
        const newId = `p_${now}`;
        data.bookmarks[newId] = {
            name: trimmedName,
            songs: Array.isArray(initialSongs) ? initialSongs.slice() : [],
            createdAt: now
        };
        saveBookmarks();
        renderBookmarks();
        return buildActionOk({ id: newId });
    }

    /**
     * 新規ブックマークを空の状態で作成する。
     * @param {*} bookmarkName
     */
    function createBookmark(bookmarkName) {
        return createBookmarkRecord(bookmarkName, []);
    }

    /**
     * 新規ブックマークを作成し、指定曲を初期登録する。
     * @param {*} bookmarkName
     * @param {*} songKey
     */
    function createBookmarkAndAdd(bookmarkName, songKey) {
        return createBookmarkRecord(bookmarkName, [songKey]);
    }

    /**
     * ブックマークを削除し、アクティブ状態と表示を更新する。
     * @param {*} bookmarkId
     */
    function deleteBookmark(bookmarkId) {
        const bookmark = data.bookmarks[bookmarkId];
        if (!bookmark) return false;
        const wasActive = data.activeBookmark === bookmarkId;
        delete data.bookmarks[bookmarkId];
        if (wasActive) data.activeBookmark = null;
        saveBookmarks();
        renderBookmarks();
        if (wasActive) scheduleSearch({ immediate: true });
        return true;
    }

    /**
     * ブックマーク名を変更して保存し、一覧を再描画する。
     * 変更対象がアクティブな場合は検索結果表示も即時更新する。
     * @param {string} bookmarkId
     * @param {string} newName
     * @returns {{ ok: boolean, reason?: string, changed?: boolean }}
     */
    function renameBookmark(bookmarkId, newName) {
        const bookmark = data.bookmarks[bookmarkId];
        if (!bookmark) return buildActionFail("bookmark_not_found");
        if (typeof newName !== "string") return buildActionFail("invalid_name_type");

        const trimmedName = newName.trim();
        if (!trimmedName) return buildActionFail("empty_name");

        if (bookmark.name === trimmedName) {
            return buildActionOk({ changed: false });
        }

        bookmark.name = trimmedName;
        saveBookmarks();
        renderBookmarks();
        if (data.activeBookmark === bookmarkId) {
            scheduleSearch({ immediate: true });
        }
        return buildActionOk({ changed: true });
    }

    /**
     * 現在の検索条件をローカルストレージへ保存する。
     */
    function saveSearchState() {
        try {
            const searchBox = ui.el.searchBox;
            const relayOnly = ui.el.relayOnly;
            const harmonyOnly = ui.el.harmonyOnly;
            const dateFrom = getDateSelectValue("from");
            const dateTo = getDateSelectValue("to");
            const payload = {
                query: searchBox ? searchBox.value : "",
                relayOnly: relayOnly ? !!relayOnly.checked : false,
                harmonyOnly: harmonyOnly ? !!harmonyOnly.checked : false,
                dateFrom,
                dateTo,
                formats: Array.from(searchUi.selectedFormats)
            };
            localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn("Failed to save search state", e);
        }
    }

    /**
     * 保存済み検索条件をUIとstateへ復元する。
     */
    function restoreSearchState() {
        try {
            const raw = localStorage.getItem(SEARCH_STATE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const searchBox = ui.el.searchBox;
            const relayOnly = ui.el.relayOnly;
            const harmonyOnly = ui.el.harmonyOnly;
            applySelectedFormatsFromRaw(parsed.formats);
            syncFormatCheckboxesFromState();
            if (searchBox && typeof parsed.query === "string") {
                searchBox.value = parsed.query;
            }
            if (relayOnly) relayOnly.checked = !!parsed.relayOnly;
            if (harmonyOnly) harmonyOnly.checked = !!parsed.harmonyOnly;
            const pending = {
                from: typeof parsed.dateFrom === "string" ? parsed.dateFrom : "",
                to: typeof parsed.dateTo === "string" ? parsed.dateTo : ""
            };
            dateUi.pendingValues = pending;
            if (dateUi.bounds) {
                applyPendingDateValues();
            }
            searchUi.userTouchedQuery = true;
            searchUi.userTouchedFilters = true;
            searchUi.hasRestoredSearchState = true;
        } catch (e) {
            console.warn("Failed to restore search state", e);
        }
    }

    return {
        setSelectedFormatsToDefault,
        syncFormatCheckboxesFromState,
        applySelectedFormatsFromRaw,
        loadBookmarks,
        saveBookmarks,
        migrateLegacyBookmarkSongRefs,
        addSongToBookmark,
        createBookmark,
        createBookmarkAndAdd,
        deleteBookmark,
        renameBookmark,
        saveSearchState,
        restoreSearchState,
        removeSongFromBookmark
    };
}
