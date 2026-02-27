/**
 * createStorageController を実行する
 * @param {*} ui
 * @param {*} constants
 */
export function createStorageController({ data, ui, constants, callbacks }) {
    const { DEFAULT_FORMATS, SEARCH_STATE_KEY, BOOKMARK_STORAGE_KEY } = constants;
    const {
        getDateSelectValue,
        applyPendingDateValues,
        renderBookmarks,
        scheduleSearch
    } = callbacks;

    /**
     * setSelectedFormatsToDefault を実行する
     */
    function setSelectedFormatsToDefault() {
        ui.selectedFormats.clear();
        DEFAULT_FORMATS.forEach((f) => ui.selectedFormats.add(f));
    }

    /**
     * syncFormatCheckboxesFromState を実行する
     */
    function syncFormatCheckboxesFromState() {
        const formatCheckboxes = document.querySelectorAll('#formatsList input[type="checkbox"]');
        formatCheckboxes.forEach((cb) => {
            cb.checked = ui.selectedFormats.has(cb.value);
        });
    }

    /**
     * applySelectedFormatsFromRaw を実行する
     * @param {*} rawFormats
     */
    function applySelectedFormatsFromRaw(rawFormats) {
        const formats = Array.isArray(rawFormats) ? rawFormats : [];
        const allowed = new Set(DEFAULT_FORMATS);
        ui.selectedFormats.clear();
        formats.forEach((f) => {
            if (allowed.has(f)) ui.selectedFormats.add(f);
        });
        if (ui.selectedFormats.size === 0) {
            setSelectedFormatsToDefault();
        }
    }

    /**
     * sanitizeBookmarks を実行する
     * @param {*} raw
     */
    function sanitizeBookmarks(raw) {
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
     * saveBookmarks を実行する
     */
    function saveBookmarks() {
        try {
            localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(data.bookmarks));
        } catch (e) {
            console.error("Failed to save bookmarks", e);
        }
    }

    /**
     * loadBookmarks を実行する
     */
    function loadBookmarks() {
        try {
            const stored = localStorage.getItem(BOOKMARK_STORAGE_KEY);
            if (stored) {
                data.bookmarks = sanitizeBookmarks(JSON.parse(stored));
            }
        } catch (e) {
            console.error("Failed to load bookmarks", e);
            data.bookmarks = {};
        }
        renderBookmarks();
    }

    /**
     * migrateLegacyBookmarkSongRefs を実行する
     */
    function migrateLegacyBookmarkSongRefs() {
        const legacyMap = new Map(data.allSongsRaw.map((row) => [row.sourceIndex, row.songKey]));
        let updated = false;
        Object.values(data.bookmarks).forEach((bookmark) => {
            const nextSongs = [];
            const seen = new Set();
            const prevSongs = Array.isArray(bookmark.songs) ? bookmark.songs : [];
            prevSongs.forEach((ref) => {
                let normalized = null;
                if (typeof ref === "string") {
                    normalized = ref;
                } else if (Number.isFinite(ref)) {
                    normalized = legacyMap.get(ref) || null;
                }
                if (!normalized) return;
                if (seen.has(normalized)) return;
                seen.add(normalized);
                nextSongs.push(normalized);
            });
            if (prevSongs.length !== nextSongs.length || prevSongs.some((ref, idx) => ref !== nextSongs[idx])) {
                bookmark.songs = nextSongs;
                updated = true;
            }
        });
        if (updated) saveBookmarks();
    }

    /**
     * removeSongFromBookmark を実行する
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
     * addSongToBookmark を実行する
     * @param {*} bookmarkId
     * @param {*} songKey
     */
    function addSongToBookmark(bookmarkId, songKey) {
        const bookmark = data.bookmarks[bookmarkId];
        if (!bookmark || bookmark.songs.includes(songKey)) return false;
        bookmark.songs.push(songKey);
        saveBookmarks();
        renderBookmarks();
        if (data.activeBookmark === bookmarkId) {
            scheduleSearch({ immediate: true });
        }
        return true;
    }

    /**
     * createBookmarkAndAdd を実行する
     * @param {*} bookmarkName
     * @param {*} songKey
     */
    function createBookmarkAndAdd(bookmarkName, songKey) {
        const now = Date.now();
        const newId = `p_${now}`;
        data.bookmarks[newId] = {
            name: bookmarkName,
            songs: [songKey],
            createdAt: now
        };
        saveBookmarks();
        renderBookmarks();
        return newId;
    }

    /**
     * deleteBookmark を実行する
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
     * saveSearchState を実行する
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
                formats: Array.from(ui.selectedFormats)
            };
            localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn("Failed to save search state", e);
        }
    }

    /**
     * restoreSearchState を実行する
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
            ui.pendingDateValues = pending;
            if (ui.dateBounds) {
                applyPendingDateValues();
            }
            ui.userTouchedQuery = true;
            ui.userTouchedFilters = true;
            ui.hasRestoredSearchState = true;
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
        createBookmarkAndAdd,
        deleteBookmark,
        saveSearchState,
        restoreSearchState,
        removeSongFromBookmark
    };
}

