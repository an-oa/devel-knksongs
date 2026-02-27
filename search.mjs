/**
 * normalizeForSearch を実行する
 * @param {*} s
 */
export function normalizeForSearch(s) {
    return (s || "")
        .normalize("NFKC")
        .replace(/[\u3041-\u3096\u309D-\u309F]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60))
        .toLowerCase();
}

/**
 * parseDateKey を実行する
 * @param {*} raw
 */
export function parseDateKey(raw) {
    if (!raw) return null;
    const trimmed = raw.trim();
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(trimmed);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return year * 10000 + month * 100 + day;
}

/**
 * dateKeyToParts を実行する
 * @param {*} key
 */
export function dateKeyToParts(key) {
    const year = Math.floor(key / 10000);
    const month = Math.floor((key % 10000) / 100);
    const day = key % 100;
    return { year, month, day };
}

/**
 * isWithinDateRange を実行する
 * @param {*} row
 * @param {*} fromKey
 * @param {*} toKey
 */
export function isWithinDateRange(row, fromKey, toKey) {
    if (!fromKey && !toKey) return true;
    if (!row.dateKey) return false;
    if (fromKey && row.dateKey < fromKey) return false;
    if (toKey && row.dateKey > toKey) return false;
    return true;
}

/**
 * filterSongsByCriteria を実行する
 * @param {*} rows
 * @param {*} searchState
 * @param {*} selectedFormats
 */
export function filterSongsByCriteria(rows, searchState, selectedFormats) {
    const queryNorm = normalizeForSearch(searchState.queryRaw);
    const keywords = queryNorm.split(/[\s\u3000]+/).filter((k) => k.length > 0);
    return rows.filter((row) => {
        const matchText = keywords.every((kw) =>
            row.titleNorm.includes(kw) ||
            row.artistNorm.includes(kw) ||
            row.titleYomiNorm.includes(kw) ||
            row.artistYomiNorm.includes(kw)
        );
        const matchDate = isWithinDateRange(row, searchState.dateFromKey, searchState.dateToKey);
        return matchText &&
            matchDate &&
            selectedFormats.has(row.format) &&
            (!searchState.relayOnly || row.isRelay) &&
            (!searchState.harmonyOnly || row.isHarmony);
    });
}

/**
 * createSearchController を実行する
 * @param {*} ui
 */
export function createSearchController({ data, ui, constants }) {
    const {
        RANDOM_DISPLAY_COUNT,
        MIN_PERFORMANCE_FOR_RANDOM,
        INCREMENT_COUNT,
        SEARCH_DEBOUNCE_MS,
        DEFAULT_FORMATS
    } = constants;
    let updateDisplay = () => {};
    let scrollResultsPaneToTop = () => {};

    /**
     * setRenderHooks を実行する
     * @param {*} hooks
     */
    function setRenderHooks(hooks) {
        if (hooks && typeof hooks.updateDisplay === "function") {
            updateDisplay = hooks.updateDisplay;
        }
        if (hooks && typeof hooks.scrollResultsPaneToTop === "function") {
            scrollResultsPaneToTop = hooks.scrollResultsPaneToTop;
        }
    }

    /**
     * scheduleSearch を実行する
     * @param {*} options
     */
    function scheduleSearch(options) {
        if (ui.searchDebounceId) clearTimeout(ui.searchDebounceId);
        if (options && options.immediate) {
            search();
            return;
        }
        ui.searchDebounceId = setTimeout(() => {
            ui.searchDebounceId = 0;
            search();
        }, SEARCH_DEBOUNCE_MS);
    }

    /**
     * search を実行する
     */
    function search() {
        const searchInput = collectSearchInput();
        const outcome = resolveSearchOutcome(searchInput.searchState);
        applySearchOutcome(searchInput, outcome);
    }

    /**
     * collectSearchInput を実行する
     */
    function collectSearchInput() {
        return {
            searchState: getSearchState(),
            resultCountEl: ui.el.resultCount
        };
    }

    /**
     * resolveSearchOutcome を実行する
     * @param {*} searchState
     */
    function resolveSearchOutcome(searchState) {
        return resolveSearchResults(searchState);
    }

    /**
     * applySearchOutcome を実行する
     * @param {*} searchInput
     * @param {*} outcome
     */
    function applySearchOutcome(searchInput, outcome) {
        data.currentResults = outcome.results;
        data.displayLimit = outcome.displayLimit;
        if (searchInput.resultCountEl) searchInput.resultCountEl.innerText = outcome.label;
        updateDisplay();
        scrollResultsPaneToTop();
    }

    /**
     * getSearchState を実行する
     */
    function getSearchState() {
        const fromRange = getPartialDateRange("from");
        const toRange = getPartialDateRange("to");
        return {
            queryRaw: ui.el.searchBox.value.trim(),
            relayOnly: ui.el.relayOnly.checked,
            harmonyOnly: ui.el.harmonyOnly.checked,
            dateFromKey: fromRange ? fromRange.minKey : null,
            dateToKey: toRange ? toRange.maxKey : null,
            hasDateFilter: Boolean(fromRange || toRange)
        };
    }

    /**
     * areAllFormatsSelected を実行する
     */
    function areAllFormatsSelected() {
        return DEFAULT_FORMATS.every((f) => ui.selectedFormats.has(f));
    }

    /**
     * areFormatsDefault を実行する
     */
    function areFormatsDefault() {
        if (ui.selectedFormats.size !== DEFAULT_FORMATS.length) return false;
        return areAllFormatsSelected();
    }

    /**
     * isRecommendedMode を実行する
     * @param {*} searchState
     */
    function isRecommendedMode(searchState) {
        return !data.activePlaylist &&
            searchState.queryRaw === "" &&
            !searchState.relayOnly &&
            !searchState.harmonyOnly &&
            !searchState.hasDateFilter &&
            areAllFormatsSelected();
    }

    /**
     * resolvePlaylistRows を実行する
     * @param {*} playlist
     */
    function resolvePlaylistRows(playlist) {
        const songMapByKey = new Map(data.allSongsRaw.map((row) => [row.songKey, row]));
        const songMapByLegacyIndex = new Map(data.allSongsRaw.map((row) => [row.sourceIndex, row]));
        const songs = Array.isArray(playlist.songs) ? playlist.songs : [];
        return songs
            .map((songRef) => {
                if (typeof songRef === "string") return songMapByKey.get(songRef);
                if (Number.isFinite(songRef)) return songMapByLegacyIndex.get(songRef);
                return null;
            })
            .filter(Boolean);
    }

    /**
     * resolveSearchResults を実行する
     * @param {*} searchState
     */
    function resolveSearchResults(searchState) {
        if (data.activePlaylist) {
            const playlist = data.playlists[data.activePlaylist];
            if (playlist) {
                const results = resolvePlaylistRows(playlist);
                return {
                    results,
                    displayLimit: results.length,
                    label: `プレイリスト: ${playlist.name}`
                };
            }
        }

        if (isRecommendedMode(searchState)) {
            return {
                results: pickRecommended(),
                displayLimit: RANDOM_DISPLAY_COUNT,
                label: "おすすめを表示中"
            };
        }
        const results = filterSongs(searchState);
        return {
            results,
            displayLimit: INCREMENT_COUNT,
            label: `${results.length} 件がヒット`
        };
    }

    /**
     * buildDateIndex を実行する
     * @param {*} songs
     */
    function buildDateIndex(songs) {
        const index = new Map();
        for (const row of songs) {
            if (!row.dateKey) continue;
            const { year, month, day } = dateKeyToParts(row.dateKey);
            const key = `${year}-${String(month).padStart(2, "0")}`;
            if (!index.has(key)) index.set(key, new Set());
            index.get(key).add(day);
        }
        const normalized = new Map();
        for (const [key, set] of index.entries()) {
            normalized.set(key, Array.from(set).sort((a, b) => a - b));
        }
        return normalized;
    }

    /**
     * getAvailableDays を実行する
     * @param {*} year
     * @param {*} month
     */
    function getAvailableDays(year, month) {
        if (!ui.dateIndex) return [];
        const key = `${year}-${month}`;
        return ui.dateIndex.get(key) || [];
    }

    /**
     * hasDateSelection を実行する
     */
    function hasDateSelection() {
        return hasPartialDateSelection("from") || hasPartialDateSelection("to");
    }

    /**
     * hasPartialDateSelection を実行する
     * @param {*} kind
     */
    function hasPartialDateSelection(kind) {
        const parts = getDateSelectParts(kind);
        return parts.year !== "" || parts.month !== "" || parts.day !== "";
    }

    /**
     * getDateSelectParts を実行する
     * @param {*} kind
     */
    function getDateSelectParts(kind) {
        const isFrom = kind === "from";
        const year = (isFrom ? ui.el.dateFromYear : ui.el.dateToYear)?.value ?? "";
        const month = (isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth)?.value ?? "";
        const day = (isFrom ? ui.el.dateFromDay : ui.el.dateToDay)?.value ?? "";
        return { year, month, day };
    }

    /**
     * getDateSelectValue を実行する
     * @param {*} kind
     */
    function getDateSelectValue(kind) {
        const { year, month, day } = getDateSelectParts(kind);
        if (!year || !month || !day) return "";
        return `${year}-${month}-${day}`;
    }

    /**
     * applyDateSelectValue を実行する
     * @param {*} kind
     * @param {*} value
     */
    function applyDateSelectValue(kind, value) {
        if (!value) return;
        const key = parseDateKey(value);
        if (!key) return;
        const { year, month, day } = dateKeyToParts(key);
        const isFrom = kind === "from";
        const yearSelect = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
        const monthSelect = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
        const daySelect = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
        if (!yearSelect || !monthSelect || !daySelect) return;
        yearSelect.value = String(year);
        syncDateSelectOptions(kind);
        monthSelect.value = String(month).padStart(2, "0");
        syncDateSelectOptions(kind);
        daySelect.value = String(day).padStart(2, "0");
    }

    /**
     * resetDateSelects を実行する
     */
    function resetDateSelects() {
        ["from", "to"].forEach((kind) => {
            const isFrom = kind === "from";
            const year = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
            const month = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
            const day = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
            if (year) year.value = "";
            if (month) month.value = "";
            if (day) day.value = "";
        });
        syncDateSelectOptions();
    }

    /**
     * getPartialDateRange を実行する
     * @param {*} kind
     */
    function getPartialDateRange(kind) {
        const { year, month, day } = getDateSelectParts(kind);
        if (!year) return null;
        const y = Number(year);
        if (!month) {
            return { minKey: y * 10000 + 101, maxKey: y * 10000 + 1231 };
        }
        const m = Number(month);
        const daysInMonth = new Date(y, m, 0).getDate();
        if (!day) {
            return { minKey: y * 10000 + m * 100 + 1, maxKey: y * 10000 + m * 100 + daysInMonth };
        }
        const d = Number(day);
        return { minKey: y * 10000 + m * 100 + d, maxKey: y * 10000 + m * 100 + d };
    }

    /**
     * getConstrainedBounds を実行する
     * @param {*} kind
     */
    function getConstrainedBounds(kind) {
        if (!ui.dateBounds) return null;
        let minKey = ui.dateBounds.minKey;
        let maxKey = ui.dateBounds.maxKey;
        const otherKind = kind === "from" ? "to" : "from";
        const otherRange = getPartialDateRange(otherKind);
        if (otherRange) {
            if (kind === "to") {
                minKey = Math.max(minKey, otherRange.minKey);
            } else {
                maxKey = Math.min(maxKey, otherRange.maxKey);
            }
        }
        if (minKey > maxKey) {
            if (kind === "to") minKey = maxKey;
            else maxKey = minKey;
        }
        return { minKey, maxKey };
    }

    /**
     * initDateSelects を実行する
     * @param {*} bounds
     */
    function initDateSelects(bounds) {
        const { minKey, maxKey } = bounds;
        const minParts = dateKeyToParts(minKey);
        const maxParts = dateKeyToParts(maxKey);
        const years = [];
        for (let y = minParts.year; y <= maxParts.year; y++) {
            years.push(String(y));
        }
        buildSelectOptions(ui.el.dateFromYear, years, "年");
        buildSelectOptions(ui.el.dateToYear, years, "年");
        buildSelectOptions(ui.el.dateFromMonth, [], "月");
        buildSelectOptions(ui.el.dateToMonth, [], "月");
        buildSelectOptions(ui.el.dateFromDay, [], "日");
        buildSelectOptions(ui.el.dateToDay, [], "日");
        syncDateSelectOptions();
        applyPendingDateValues();
    }

    /**
     * buildSelectOptions を実行する
     * @param {*} select
     * @param {*} values
     * @param {*} placeholder
     */
    function buildSelectOptions(select, values, placeholder) {
        if (!select) return;
        const current = select.value;
        const fragment = document.createDocumentFragment();
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = placeholder;
        fragment.appendChild(empty);
        values.forEach((val) => {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = val;
            fragment.appendChild(opt);
        });
        select.replaceChildren(fragment);
        if (values.includes(current)) {
            select.value = current;
        } else {
            select.value = "";
        }
    }

    /**
     * syncDateSelectOptions を実行する
     * @param {*} kind
     */
    function syncDateSelectOptions(kind) {
        if (!ui.dateBounds) return;
        const targets = kind ? [kind] : ["from", "to"];
        targets.forEach((k) => {
            const bounds = getConstrainedBounds(k) || ui.dateBounds;
            const isFrom = k === "from";
            const yearSelect = isFrom ? ui.el.dateFromYear : ui.el.dateToYear;
            const monthSelect = isFrom ? ui.el.dateFromMonth : ui.el.dateToMonth;
            const daySelect = isFrom ? ui.el.dateFromDay : ui.el.dateToDay;
            if (!yearSelect || !monthSelect || !daySelect) return;
            const minParts = dateKeyToParts(bounds.minKey);
            const maxParts = dateKeyToParts(bounds.maxKey);
            const years = buildNumberRange(minParts.year, maxParts.year).map((y) => String(y));
            buildSelectOptions(yearSelect, years, "年");
            const selectedYear = yearSelect.value;
            const minMonth = selectedYear === String(minParts.year) ? minParts.month : 1;
            const maxMonth = selectedYear === String(maxParts.year) ? maxParts.month : 12;
            const months = selectedYear ? buildNumberRange(minMonth, maxMonth).map((m) => String(m).padStart(2, "0")) : [];
            buildSelectOptions(monthSelect, months, "月");
            const monthVal = monthSelect.value;
            if (!selectedYear || !monthVal) {
                buildSelectOptions(daySelect, [], "日");
                return;
            }
            const monthNum = Number(monthVal);
            const availableDays = getAvailableDays(selectedYear, monthVal);
            if (availableDays.length === 0) {
                buildSelectOptions(daySelect, [], "日");
                return;
            }
            let minDay = availableDays[0];
            let maxDay = availableDays[availableDays.length - 1];
            if (selectedYear === String(minParts.year) && monthNum === minParts.month) minDay = Math.max(minDay, minParts.day);
            if (selectedYear === String(maxParts.year) && monthNum === maxParts.month) maxDay = Math.min(maxDay, maxParts.day);
            const days = availableDays
                .filter((d) => d >= minDay && d <= maxDay)
                .map((d) => String(d).padStart(2, "0"));
            buildSelectOptions(daySelect, days, "日");
        });
    }

    /**
     * applyPendingDateValues を実行する
     */
    function applyPendingDateValues() {
        if (!ui.pendingDateValues) return;
        const { from, to } = ui.pendingDateValues;
        if (from) applyDateSelectValue("from", from);
        if (to) applyDateSelectValue("to", to);
        ui.pendingDateValues = null;
    }

    /**
     * buildNumberRange を実行する
     * @param {*} start
     * @param {*} end
     */
    function buildNumberRange(start, end) {
        const list = [];
        for (let i = start; i <= end; i++) list.push(i);
        return list;
    }

    /**
     * formatDateKeyForInput を実行する
     * @param {*} key
     */
    function formatDateKeyForInput(key) {
        const year = Math.floor(key / 10000);
        const month = Math.floor((key % 10000) / 100);
        const day = key % 100;
        const mm = String(month).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${year}-${mm}-${dd}`;
    }

    /**
     * applyDateInputRange を実行する
     * @param {*} songs
     */
    function applyDateInputRange(songs) {
        const dateFromYear = ui.el.dateFromYear;
        const dateFromMonth = ui.el.dateFromMonth;
        const dateFromDay = ui.el.dateFromDay;
        const dateToYear = ui.el.dateToYear;
        const dateToMonth = ui.el.dateToMonth;
        const dateToDay = ui.el.dateToDay;
        if (!dateFromYear || !dateFromMonth || !dateFromDay || !dateToYear || !dateToMonth || !dateToDay) return null;
        let minKey = null;
        let maxKey = null;
        for (const row of songs) {
            if (!row.dateKey) continue;
            if (minKey === null || row.dateKey < minKey) minKey = row.dateKey;
            if (maxKey === null || row.dateKey > maxKey) maxKey = row.dateKey;
        }
        if (minKey === null || maxKey === null) return null;
        const bounds = { minKey, maxKey };
        ui.dateBounds = bounds;
        ui.dateIndex = buildDateIndex(songs);
        initDateSelects(bounds);
        return bounds;
    }

    /**
     * clampDateInputsToBounds を実行する
     * @param {*} minKey
     * @param {*} maxKey
     */
    function clampDateInputsToBounds(minKey, maxKey) {
        const dateFrom = ui.el.dateFromYear;
        const dateTo = ui.el.dateToYear;
        if (!dateFrom || !dateTo) return;
        const clampKey = (key) => {
            if (key === null) return null;
            if (key < minKey) return minKey;
            if (key > maxKey) return maxKey;
            return key;
        };
        let fromKey = clampKey(parseDateKey(getDateSelectValue("from")));
        let toKey = clampKey(parseDateKey(getDateSelectValue("to")));
        if (fromKey !== null && toKey !== null && fromKey > toKey) {
            toKey = fromKey;
        }
        if (fromKey !== null) applyDateSelectValue("from", formatDateKeyForInput(fromKey));
        if (toKey !== null) applyDateSelectValue("to", formatDateKeyForInput(toKey));
    }

    /**
     * clampDateInputsIfNeeded を実行する
     */
    function clampDateInputsIfNeeded() {
        if (!ui.dateBounds) return;
        clampDateInputsToBounds(ui.dateBounds.minKey, ui.dateBounds.maxKey);
    }

    /**
     * filterSongs を実行する
     * @param {*} searchState
     */
    function filterSongs(searchState) {
        return filterSongsByCriteria(data.allSongsRaw, searchState, ui.selectedFormats);
    }

    /**
     * shuffleInPlace を実行する
     * @param {*} list
     */
    function shuffleInPlace(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    /**
     * pickRecommended を実行する
     */
    function pickRecommended() {
        if (ui.recommendedCache) return ui.recommendedCache;
        ui.recommendedCache = selectRecommendedSongs(
            buildRecommendedGroups(data.allSongsRaw),
            RANDOM_DISPLAY_COUNT
        );
        return ui.recommendedCache;
    }

    /**
     * buildRecommendedGroups を実行する
     * @param {*} songs
     */
    function buildRecommendedGroups(songs) {
        const dedupedRows = collapseRecommendedRowsByArchive(songs);
        const groups = groupRecommendedRowsBySong(dedupedRows);
        const result = [];
        for (const [key, entry] of groups.entries()) {
            if (entry.rows.length < MIN_PERFORMANCE_FOR_RANDOM) continue;
            const latestRows = pickRecommendedLatestRows(entry);
            if (latestRows.length === 0) continue;
            result.push({ key, latestRows });
        }
        return result;
    }

    /**
     * collapseRecommendedRowsByArchive を実行する
     * @param {*} songs
     */
    function collapseRecommendedRowsByArchive(songs) {
        const songRowsByArchive = new Map();
        for (const row of songs) {
            if (!isRecommendedCountFormat(row.format)) continue;
            const archiveKey = getRecommendedSongArchiveKey(row);
            const existing = songRowsByArchive.get(archiveKey);
            if (!existing || isHigherArchiveOrder(row, existing)) {
                songRowsByArchive.set(archiveKey, row);
            }
        }
        return Array.from(songRowsByArchive.values());
    }

    /**
     * groupRecommendedRowsBySong を実行する
     * @param {*} rows
     */
    function groupRecommendedRowsBySong(rows) {
        const groups = new Map();
        for (const row of rows) {
            const key = getRecommendedSongKey(row);
            if (!groups.has(key)) {
                groups.set(key, { rows: [], utamitaRows: [], streamRows: [], shortRows: [] });
            }
            const entry = groups.get(key);
            entry.rows.push(row);
            if (isUtamitaFormat(row.format)) entry.utamitaRows.push(row);
            if (isStreamFormat(row.format)) entry.streamRows.push(row);
            if (isShortFormat(row.format)) entry.shortRows.push(row);
        }
        return groups;
    }

    /**
     * pickRecommendedLatestRows を実行する
     * @param {*} entry
     */
    function pickRecommendedLatestRows(entry) {
        if (entry.utamitaRows.length > 0) {
            return entry.utamitaRows.slice(0, 1);
        }
        if (entry.streamRows.length > 0) {
            return entry.streamRows.slice(0, MIN_PERFORMANCE_FOR_RANDOM);
        }
        if (entry.shortRows.length > 0) {
            return entry.shortRows.slice(0, MIN_PERFORMANCE_FOR_RANDOM);
        }
        return [];
    }

    /**
     * selectRecommendedSongs を実行する
     * @param {*} groups
     * @param {*} count
     */
    function selectRecommendedSongs(groups, count) {
        const pickedGroups = shuffleInPlace(groups.slice()).slice(0, count);
        return pickedGroups.map((group) => pickRandomEntry(group.latestRows));
    }

    /**
     * pickRandomEntry を実行する
     * @param {*} list
     */
    function pickRandomEntry(list) {
        const idx = Math.floor(Math.random() * list.length);
        return list[idx];
    }

    /**
     * getRecommendedSongKey を実行する
     * @param {*} row
     */
    function getRecommendedSongKey(row) {
        return [
            row.titleNorm || "",
            row.artistNorm || "",
            row.titleYomiNorm || "",
            row.artistYomiNorm || ""
        ].join("|||");
    }

    /**
     * getRecommendedSongArchiveKey を実行する
     * @param {*} row
     */
    function getRecommendedSongArchiveKey(row) {
        return `${getRecommendedSongKey(row)}|||${row.archiveId || ""}`;
    }

    /**
     * isHigherArchiveOrder を実行する
     * @param {*} candidate
     * @param {*} current
     */
    function isHigherArchiveOrder(candidate, current) {
        const candidateOrder = candidate.archiveOrder ?? -1;
        const currentOrder = current.archiveOrder ?? -1;
        if (candidateOrder !== currentOrder) return candidateOrder > currentOrder;
        return candidate.sourceIndex > current.sourceIndex;
    }

    /**
     * isRecommendedCountFormat を実行する
     * @param {*} format
     */
    function isRecommendedCountFormat(format) {
        return isStreamFormat(format) || isUtamitaFormat(format) || isShortFormat(format);
    }

    /**
     * isUtamitaFormat を実行する
     * @param {*} format
     */
    function isUtamitaFormat(format) {
        return format === "歌みた";
    }

    /**
     * isStreamFormat を実行する
     * @param {*} format
     */
    function isStreamFormat(format) {
        return format === "配信";
    }

    /**
     * isShortFormat を実行する
     * @param {*} format
     */
    function isShortFormat(format) {
        return format === "ショート";
    }

    return {
        setRenderHooks,
        scheduleSearch,
        search,
        getSearchState,
        isRecommendedMode,
        areAllFormatsSelected,
        areFormatsDefault,
        hasDateSelection,
        getDateSelectValue,
        applyDateSelectValue,
        resetDateSelects,
        getPartialDateRange,
        syncDateSelectOptions,
        applyPendingDateValues,
        applyDateInputRange,
        clampDateInputsToBounds,
        clampDateInputsIfNeeded
    };
}
