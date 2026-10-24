import { normalizeForSearch } from "../../app/lib/search-normalization.mts";
import { createSongFixture } from "./song.mts";

/**
 * 検索用の曲fixtureの入力。英名は Song に元の値を持たないため、元の値を専用の項目で受け取り、
 * 出力時に正規化済みの *Norm を作る。
 */
type SearchSongFixtureInput = Omit<Partial<Song>, "titleEnNorm" | "artistEnNorm" | "artistSortNorm"> & {
    titleEn?: string;
    artistEn?: string;
    artistSort?: string;
};

/** 呼び出し元ごとに独立した連番を持つ検索用の曲fixture生成関数を作る。 */
export function createSearchSongFixtureFactory() {
    let autoSongId = 0;

    /** 曲キーと検索用の正規化済みフィールドを補って曲を作る。 */
    return function createSearchSongFixture(input: SearchSongFixtureInput): Song {
        const { titleEn = "", artistEn = "", artistSort = "", ...songInput } = input;
        const title = songInput.title ?? "";
        const artist = songInput.artist ?? "";
        const titleYomi = songInput.titleYomi ?? "";
        const artistYomi = songInput.artistYomi ?? "";
        const songKey = songInput.songKey ?? `song-${++autoSongId}`;
        return createSongFixture({
            ...songInput,
            archiveId: songInput.archiveId ?? "",
            archiveOrder: songInput.archiveOrder ?? 1,
            songKey,
            bookmarkSongKey: songInput.bookmarkSongKey ?? songKey,
            dateKey: songInput.dateKey ?? null,
            format: songInput.format ?? "配信",
            streamRole: songInput.streamRole ?? "",
            isRelay: !!songInput.isRelay,
            isHarmony: !!songInput.isHarmony,
            title,
            artist,
            titleYomi,
            artistYomi,
            titleNorm: normalizeForSearch(title),
            artistNorm: normalizeForSearch(artist),
            titleYomiNorm: normalizeForSearch(titleYomi),
            artistYomiNorm: normalizeForSearch(artistYomi),
            titleEnNorm: normalizeForSearch(titleEn),
            artistEnNorm: normalizeForSearch(artistEn),
            artistSortNorm: normalizeForSearch(artistSort)
        });
    };
}
