import { isGuestStreamRole } from "./stream-role.mjs";
import {
    isOriginalSongFormat,
    isShortFormat,
    isStreamFormat,
    isUtamitaEquivalentFormat
} from "./song-format.mjs";

/** 条件未指定時に表示するおすすめ曲のキャッシュ。 */
export type RecommendedSearchCache = {
    /** 抽出済みのおすすめ曲。 */
    songs: Song[];
    /** この cache が満たしている要求件数。 */
    requestedCount: number;
};

type RecommendedCacheSelectionOptions = {
    count: number;
    minPerformanceCount: number;
    currentCache?: RecommendedSearchCache | null;
};

type RecommendedCacheSelectionResult = {
    songs: Song[];
    cache: RecommendedSearchCache;
};

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
 * 既存 cache を尊重しながら、おすすめ表示に必要な曲一覧と次の cache state を返す。
 * @param {Song[]} songs
 * @param {RecommendedCacheSelectionOptions} options
 * @returns {RecommendedCacheSelectionResult}
 */
export function pickRecommendedSongsWithCache(
    songs: Song[],
    {
        count,
        minPerformanceCount,
        currentCache = null
    }: RecommendedCacheSelectionOptions
): RecommendedCacheSelectionResult {
    const cachedSongs = getRecommendedCacheSongs(currentCache);
    if (cachedSongs && getRecommendedCacheRequestedCount(currentCache) >= count) {
        return {
            songs: cachedSongs.slice(0, count),
            cache: currentCache as RecommendedSearchCache
        };
    }
    const nextSongs = cachedSongs
        ? expandRecommendedCache(songs, cachedSongs, count, minPerformanceCount)
        : pickRecommendedSongs(songs, { count, minPerformanceCount });
    return {
        songs: nextSongs,
        cache: createRecommendedCacheState(nextSongs, count)
    };
}

/**
 * cache と要求件数を同じ lifecycle で扱うおすすめ cache state を作る。
 * @param {Song[]} songs
 * @param {number} requestedCount
 * @returns {RecommendedSearchCache}
 */
function createRecommendedCacheState(
    songs: Song[],
    requestedCount: number
): RecommendedSearchCache {
    return {
        songs,
        requestedCount
    };
}

/**
 * 現在のおすすめ cache から曲配列を返す。
 * @param {RecommendedSearchCache | null | undefined} cache
 * @returns {Song[] | null}
 */
function getRecommendedCacheSongs(cache: RecommendedSearchCache | null | undefined): Song[] | null {
    return cache && Array.isArray(cache.songs) ? cache.songs : null;
}

/**
 * 現在のおすすめ cache が満たしている要求件数を返す。
 * @param {RecommendedSearchCache | null | undefined} cache
 * @returns {number}
 */
function getRecommendedCacheRequestedCount(cache: RecommendedSearchCache | null | undefined): number {
    if (!cache || !Number.isFinite(cache.requestedCount)) return 0;
    return cache.requestedCount;
}

/**
 * 既存 cache の並びを保ったまま、不足分だけ新しいおすすめ候補で補う。
 * @param {Song[]} songs
 * @param {Song[]} currentCache
 * @param {number} count
 * @param {number} minPerformanceCount
 * @returns {Song[]}
 */
function expandRecommendedCache(
    songs: Song[],
    currentCache: Song[],
    count: number,
    minPerformanceCount: number
): Song[] {
    const nextCache = currentCache.slice();
    const usedKeys = new Set(nextCache.map((row) => getRecommendedSongKey(row)));
    const picked = pickRecommendedSongs(songs, {
        count: count + currentCache.length,
        minPerformanceCount
    });
    for (const row of picked) {
        const key = getRecommendedSongKey(row);
        if (usedKeys.has(key)) continue;
        nextCache.push(row);
        usedKeys.add(key);
        if (nextCache.length >= count) break;
    }
    return nextCache;
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
        if (isGuestStreamRole(row.streamRole)) continue;
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
 * おすすめ抽選で使う同一曲判定用の正規化キーを生成する。
 * cache 拡張時も同じ単位で重複除外するため export している。
 * @param {*} row
 */
export function getRecommendedSongKey(row) {
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
