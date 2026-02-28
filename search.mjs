/**
 * 検索比較しやすい形に文字列を正規化する。
 * @param {*} s
 */
export function normalizeForSearch(s) {
    return (s || "")
        .normalize("NFKC")
        .replace(/[\u3041-\u3096\u309D-\u309F]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60))
        .toLowerCase();
}

/**
 * 日付文字列を `YYYYMMDD` 形式の数値キーへ解析する。
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
 * 日付キーを年・月・日に分解する。
 * @param {*} key
 */
export function dateKeyToParts(key) {
    const year = Math.floor(key / 10000);
    const month = Math.floor((key % 10000) / 100);
    const day = key % 100;
    return { year, month, day };
}

/**
 * 曲データの日付が指定範囲内かどうかを判定する。
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
 * クエリ・日付・形式・フラグ条件で曲一覧を絞り込む。
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
 * 検索条件の収集・結果解決・推薦選曲を管理するコントローラーを作成する。
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
     * 検索後に呼び出す描画フックを登録する。
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
     * デバウンス付きで検索実行を予約し、必要時は即時実行する。
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
     * 検索入力の収集から結果反映までの処理を行う。
     */
    function search() {
        const searchInput = collectSearchInput();
        const outcome = resolveSearchOutcome(searchInput.searchState);
        applySearchOutcome(searchInput, outcome);
    }

    /**
     * 検索実行に必要な入力情報を収集する。
     */
    function collectSearchInput() {
        return {
            searchState: getSearchState(),
            resultCountEl: ui.el.resultCount
        };
    }

    /**
     * 検索状態から表示用の結果セットを導出する。
     * @param {*} searchState
     */
    function resolveSearchOutcome(searchState) {
        return resolveSearchResults(searchState);
    }

    /**
     * 検索結果をstateとUIへ反映する。
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
     * 現在のUI入力から検索条件オブジェクトを生成する。
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
     * 既定フォーマットがすべて選択されているか判定する。
     */
    function areAllFormatsSelected() {
        return DEFAULT_FORMATS.every((f) => ui.selectedFormats.has(f));
    }

    /**
     * フォーマット選択が既定状態と一致するか判定する。
     */
    function areFormatsDefault() {
        if (ui.selectedFormats.size !== DEFAULT_FORMATS.length) return false;
        return areAllFormatsSelected();
    }

    /**
     * 条件未指定時のおすすめ表示モードかどうかを判定する。
     * @param {*} searchState
     */
    function isRecommendedMode(searchState) {
        return !data.activeBookmark &&
            searchState.queryRaw === "" &&
            !searchState.relayOnly &&
            !searchState.harmonyOnly &&
            !searchState.hasDateFilter &&
            areAllFormatsSelected();
    }

    /**
     * ブックマーク内の参照IDを曲データ配列へ解決する。
     * @param {*} bookmark
     */
    function resolveBookmarkRows(bookmark) {
        ensureSongLookupMaps();
        const songs = Array.isArray(bookmark.songs) ? bookmark.songs : [];
        return songs
            .map((songRef) => {
                if (typeof songRef === "string") return ui.songMapByKey.get(songRef);
                if (Number.isFinite(songRef)) return ui.songMapByLegacyIndex.get(songRef);
                return null;
            })
            .filter(Boolean);
    }

    /**
     * 曲参照用の検索マップを必要時に再構築する。
     */
    function ensureSongLookupMaps() {
        if (ui.songLookupSourceRef === data.allSongsRaw &&
            ui.songMapByKey instanceof Map &&
            ui.songMapByLegacyIndex instanceof Map) {
            return;
        }
        ui.songMapByKey = new Map(data.allSongsRaw.map((row) => [row.songKey, row]));
        ui.songMapByLegacyIndex = new Map(data.allSongsRaw.map((row) => [row.sourceIndex, row]));
        ui.songLookupSourceRef = data.allSongsRaw;
    }

    /**
     * 通常検索・ブックマーク検索・おすすめ表示を切り替えて結果を作る。
     * @param {*} searchState
     */
    function resolveSearchResults(searchState) {
        if (data.activeBookmark) {
            const bookmark = data.bookmarks[data.activeBookmark];
            if (bookmark) {
                const bookmarkRows = resolveBookmarkRows(bookmark);
                const results = filterSongsByCriteria(bookmarkRows, searchState, ui.selectedFormats);
                return buildIncrementalSearchOutcome(
                    results,
                    `ブックマーク: ${bookmark.name} (${results.length} 件)`
                );
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
        return buildIncrementalSearchOutcome(results, `${results.length} 件がヒット`);
    }

    /**
     * 段階表示用の件数上限を含む検索結果オブジェクトを作る。
     * @param {*} results
     * @param {*} label
     */
    function buildIncrementalSearchOutcome(results, label) {
        return {
            results,
            displayLimit: Math.min(results.length, INCREMENT_COUNT),
            label
        };
    }

    /**
     * 年/月ごとの利用可能日を引ける日付インデックスを作る。
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
     * 指定した年/月で選択可能な日一覧を返す。
     * @param {*} year
     * @param {*} month
     */
    function getAvailableDays(year, month) {
        if (!ui.dateIndex) return [];
        const key = `${year}-${month}`;
        return ui.dateIndex.get(key) || [];
    }

    /**
     * 開始/終了いずれかの日付選択があるか判定する。
     */
    function hasDateSelection() {
        return hasPartialDateSelection("from") || hasPartialDateSelection("to");
    }

    /**
     * 指定側の日付セレクトに部分入力があるか判定する。
     * @param {*} kind
     */
    function hasPartialDateSelection(kind) {
        const parts = getDateSelectParts(kind);
        return parts.year !== "" || parts.month !== "" || parts.day !== "";
    }

    /**
     * 開始または終了側の日付セレクト値を取得する。
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
     * 日付セレクトの値を `YYYY-MM-DD` 文字列で取得する。
     * @param {*} kind
     */
    function getDateSelectValue(kind) {
        const { year, month, day } = getDateSelectParts(kind);
        if (!year || !month || !day) return "";
        return `${year}-${month}-${day}`;
    }

    /**
     * 日付文字列をセレクトUIへ反映する。
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
     * 日付セレクトを全クリアして選択肢を同期する。
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
     * 部分指定を含む日付入力から最小/最大キー範囲を求める。
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
     * 反対側入力を考慮した選択可能日付範囲を計算する。
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
     * 日付境界に基づいて年/月/日セレクトを初期化する。
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
     * セレクト要素の選択肢を再構築する。
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
     * 現在の境界と選択値に合わせて日付セレクト候補を同期する。
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
     * 保留していた日付復元値をセレクトへ適用する。
     */
    function applyPendingDateValues() {
        if (!ui.pendingDateValues) return;
        const { from, to } = ui.pendingDateValues;
        if (from) applyDateSelectValue("from", from);
        if (to) applyDateSelectValue("to", to);
        ui.pendingDateValues = null;
    }

    /**
     * 開始値から終了値までの連番配列を生成する。
     * @param {*} start
     * @param {*} end
     */
    function buildNumberRange(start, end) {
        const list = [];
        for (let i = start; i <= end; i++) list.push(i);
        return list;
    }

    /**
     * 日付キーを `YYYY-MM-DD` 形式へ整形する。
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
     * 曲一覧から日付境界を計算し、日付UIへ反映する。
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
     * 日付入力を許容範囲内に収め、前後関係を補正する。
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
     * 日付境界がある場合に入力値の範囲補正を行う。
     */
    function clampDateInputsIfNeeded() {
        if (!ui.dateBounds) return;
        clampDateInputsToBounds(ui.dateBounds.minKey, ui.dateBounds.maxKey);
    }

    /**
     * 全曲データを現在の検索条件で絞り込む。
     * @param {*} searchState
     */
    function filterSongs(searchState) {
        return filterSongsByCriteria(data.allSongsRaw, searchState, ui.selectedFormats);
    }

    /**
     * 配列をFisher-Yates法でインプレースシャッフルする。
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
     * おすすめ曲をキャッシュ付きで選定して返す。
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
     * おすすめ抽選に使う曲グループを構築する。
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
     * 同一アーカイブ内の候補を最新行へ集約する。
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
     * 曲同一性キーで候補をグループ化し形式別に分類する。
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
     * 優先ルールに従ってグループから採用候補行を選ぶ。
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
     * 候補グループからランダム抽出して表示曲を決定する。
     * @param {*} groups
     * @param {*} count
     */
    function selectRecommendedSongs(groups, count) {
        const pickedGroups = shuffleInPlace(groups.slice()).slice(0, count);
        return pickedGroups.map((group) => pickRandomEntry(group.latestRows));
    }

    /**
     * 配列からランダムに1件選択する。
     * @param {*} list
     */
    function pickRandomEntry(list) {
        const idx = Math.floor(Math.random() * list.length);
        return list[idx];
    }

    /**
     * 同一曲判定用の正規化キーを生成する。
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
     * 曲キーとアーカイブIDを組み合わせた集約キーを生成する。
     * @param {*} row
     */
    function getRecommendedSongArchiveKey(row) {
        return `${getRecommendedSongKey(row)}|||${row.archiveId || ""}`;
    }

    /**
     * 候補行が現在行より新しい順序かどうかを判定する。
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
     * おすすめ集計対象の形式かどうかを判定する。
     * @param {*} format
     */
    function isRecommendedCountFormat(format) {
        return isStreamFormat(format) || isUtamitaFormat(format) || isShortFormat(format);
    }

    /**
     * 形式が「歌みた」かどうかを判定する。
     * @param {*} format
     */
    function isUtamitaFormat(format) {
        return format === "歌みた";
    }

    /**
     * 形式が「配信」かどうかを判定する。
     * @param {*} format
     */
    function isStreamFormat(format) {
        return format === "配信";
    }

    /**
     * 形式が「ショート」かどうかを判定する。
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
