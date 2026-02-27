/**
 * createStorageController を実行する
 * @param {*} ui
 * @param {*} constants
 */
export function createStorageController({ data, ui, constants, callbacks }) {
    const { DEFAULT_FORMATS, SEARCH_STATE_KEY, PLAYLIST_STORAGE_KEY } = constants;
    const {
        getDateSelectValue,
        applyPendingDateValues,
        renderPlaylists
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
     * sanitizePlaylists を実行する
     * @param {*} raw
     */
    function sanitizePlaylists(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
        const sanitized = {};
        for (const [id, playlist] of Object.entries(raw)) {
            if (!playlist || typeof playlist !== "object" || Array.isArray(playlist)) continue;
            const name = typeof playlist.name === "string" ? playlist.name.trim() : "";
            if (!name) continue;
            const createdAt = Number.isFinite(playlist.createdAt) ? playlist.createdAt : 0;
            const songs = [];
            const seen = new Set();
            const rawSongs = Array.isArray(playlist.songs) ? playlist.songs : [];
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
     * savePlaylists を実行する
     */
    function savePlaylists() {
        try {
            localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(data.playlists));
        } catch (e) {
            console.error("Failed to save playlists", e);
        }
    }

    /**
     * loadPlaylists を実行する
     */
    function loadPlaylists() {
        try {
            const stored = localStorage.getItem(PLAYLIST_STORAGE_KEY);
            if (stored) {
                data.playlists = sanitizePlaylists(JSON.parse(stored));
            }
        } catch (e) {
            console.error("Failed to load playlists", e);
            data.playlists = {};
        }
        renderPlaylists();
    }

    /**
     * migrateLegacyPlaylistSongRefs を実行する
     */
    function migrateLegacyPlaylistSongRefs() {
        const legacyMap = new Map(data.allSongsRaw.map((row) => [row.sourceIndex, row.songKey]));
        let updated = false;
        Object.values(data.playlists).forEach((playlist) => {
            const nextSongs = [];
            const seen = new Set();
            const prevSongs = Array.isArray(playlist.songs) ? playlist.songs : [];
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
                playlist.songs = nextSongs;
                updated = true;
            }
        });
        if (updated) savePlaylists();
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
        loadPlaylists,
        savePlaylists,
        migrateLegacyPlaylistSongRefs,
        saveSearchState,
        restoreSearchState
    };
}
