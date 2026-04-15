import {
    isOriginalSongFormat,
    isShortFormat,
    isStreamFormat,
    isUtamitaEquivalentFormat
} from "./search-filters.mjs?v=11";

/**
 * おすすめ表示に使う曲一覧を抽選して返す。
 * @param {*} songs
 * @param {{ count: number, minPerformanceCount: number }} options
 */
export function pickRecommendedSongs(songs, { count, minPerformanceCount }) {
    const groups = buildRecommendedGroups(songs, minPerformanceCount);
    return selectRecommendedSongs(groups, count);
}

/**
 * おすすめ抽選に使う曲グループを構築する。
 * @param {*} songs
 * @param {*} minPerformanceCount
 */
function buildRecommendedGroups(songs, minPerformanceCount) {
    const dedupedRows = collapseRecommendedRowsByArchive(songs);
    const groups = groupRecommendedRowsBySong(dedupedRows);
    const result = [];
    for (const [key, entry] of groups.entries()) {
        if (!isRecommendedGroupEligible(entry, minPerformanceCount)) continue;
        const latestRows = pickRecommendedLatestRows(entry, minPerformanceCount);
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
            groups.set(key, { rows: [], utamitaRows: [], orisongRows: [], streamRows: [], shortRows: [] });
        }
        const entry = groups.get(key);
        entry.rows.push(row);
        if (isUtamitaEquivalentFormat(row.format)) entry.utamitaRows.push(row);
        if (isOriginalSongFormat(row.format)) entry.orisongRows.push(row);
        if (isStreamFormat(row.format)) entry.streamRows.push(row);
        if (isShortFormat(row.format)) entry.shortRows.push(row);
    }
    return groups;
}

/**
 * おすすめ候補グループが抽選対象かどうかを判定する。
 * オリ曲が含まれる曲は1回でも候補に含める。
 * @param {*} entry
 * @param {*} minPerformanceCount
 */
function isRecommendedGroupEligible(entry, minPerformanceCount) {
    if (entry.rows.length >= minPerformanceCount) return true;
    return entry.orisongRows.length > 0;
}

/**
 * 優先ルールに従ってグループから採用候補行を選ぶ。
 * @param {*} entry
 * @param {*} minPerformanceCount
 */
function pickRecommendedLatestRows(entry, minPerformanceCount) {
    if (entry.utamitaRows.length > 0) {
        return entry.utamitaRows.slice(0, 1);
    }
    if (entry.streamRows.length > 0) {
        return entry.streamRows.slice(0, minPerformanceCount);
    }
    if (entry.shortRows.length > 0) {
        return entry.shortRows.slice(0, minPerformanceCount);
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
 * 配列を Fisher-Yates 法でインプレースシャッフルする。
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
 * 配列からランダムに 1 件選択する。
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
 * 曲キーとアーカイブ ID を組み合わせた集約キーを生成する。
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
    return isStreamFormat(format) || isUtamitaEquivalentFormat(format) || isShortFormat(format);
}
