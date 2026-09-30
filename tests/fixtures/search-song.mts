import { normalizeForSearch } from "../../app/lib/search-normalization.mts";
import { createSongFixture } from "./song.mts";

/** 呼び出し元ごとに独立した連番を持つ検索用の曲fixture生成関数を作る。 */
export function createSearchSongFixtureFactory() {
    let autoSongId = 0;

    /** 曲キーと検索用の正規化済みフィールドを補って曲を作る。 */
    return function createSearchSongFixture(input: Partial<Song>): Song {
        const title = input.title ?? "";
        const artist = input.artist ?? "";
        const titleYomi = input.titleYomi ?? "";
        const artistYomi = input.artistYomi ?? "";
        const songKey = input.songKey ?? `song-${++autoSongId}`;
        return createSongFixture({
            ...input,
            archiveId: input.archiveId ?? "",
            archiveOrder: input.archiveOrder ?? 1,
            songKey,
            bookmarkSongKey: input.bookmarkSongKey ?? songKey,
            dateKey: input.dateKey ?? null,
            format: input.format ?? "配信",
            streamRole: input.streamRole ?? "",
            isRelay: !!input.isRelay,
            isHarmony: !!input.isHarmony,
            title,
            artist,
            titleYomi,
            artistYomi,
            titleNorm: normalizeForSearch(title),
            artistNorm: normalizeForSearch(artist),
            titleYomiNorm: normalizeForSearch(titleYomi),
            artistYomiNorm: normalizeForSearch(artistYomi)
        });
    };
}
