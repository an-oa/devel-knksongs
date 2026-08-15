import { extractYoutubeInfo } from "./youtube-url.mjs";

const ALLOWED_YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be"
]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * 値を曲データ検証用の表示文字列へ整形する。
 * @param value 表示する値
 * @returns JSON互換の表示文字列
 */
function formatIssueValue(value: unknown): string {
    if (value === undefined) return "undefined";
    return JSON.stringify(value);
}

/**
 * 曲データの場所を、マスターCSVを修正できる行番号と曲名で整形する。
 * @param song 検証中の曲データ
 * @param index 変換後の曲配列上の位置
 * @returns CSV上の場所
 */
function formatSongLocation(song: Record<string, unknown>, index: number): string {
    const sourceIndex = typeof song.sourceIndex === "number" && Number.isInteger(song.sourceIndex)
        ? song.sourceIndex
        : index;
    const title = typeof song.title === "string" ? song.title.trim() : "";
    const location = `CSV ${sourceIndex + 2}行目`;
    return title ? `${location}「${title}」` : location;
}

/**
 * URL文字列からhostを抽出する。
 * @param url 検証するURL
 * @returns URLとして解析できない場合は空文字
 */
function parseUrlHost(url: unknown): string {
    try {
        return new URL(String(url)).hostname;
    } catch {
        return "";
    }
}

/**
 * 曲データの文字列フィールドが空でないことを検証する。
 * @param song 検証中の曲データ
 * @param index 変換後の曲配列上の位置
 * @param issues 検出した問題の追加先
 */
function validateRequiredTextFields(
    song: Record<string, unknown>,
    index: number,
    issues: string[]
): void {
    for (const fieldName of ["title", "artist", "url"]) {
        if (typeof song[fieldName] !== "string" || song[fieldName].trim() === "") {
            issues.push(`${formatSongLocation(song, index)}: ${fieldName} must not be empty`);
        }
    }
}

/**
 * CSVから変換された曲データのURLとYouTube IDを検証する。
 * 本番コードではvalidateSongsDataQuality経由で使い、境界条件の単体テスト用にexportしている。
 * @param song 検証中の曲データ
 * @param index 変換後の曲配列上の位置
 * @param issues 検出した問題の追加先
 * @returns URLから抽出した再生情報
 */
export function validateSongYoutubeFields(
    song: Record<string, unknown>,
    index: number,
    issues: string[]
): ReturnType<typeof extractYoutubeInfo> {
    const host = parseUrlHost(song.url);
    if (!ALLOWED_YOUTUBE_HOSTS.has(host)) {
        issues.push(`${formatSongLocation(song, index)}: url host must be a supported YouTube host`);
    }

    const youtubeInfo = extractYoutubeInfo(typeof song.url === "string" ? song.url : "");
    if (!YOUTUBE_VIDEO_ID_PATTERN.test(youtubeInfo.videoId)) {
        issues.push(
            `${formatSongLocation(song, index)}: extracted videoId must match ${YOUTUBE_VIDEO_ID_PATTERN}`
        );
    }
    if (!Number.isFinite(youtubeInfo.startSeconds) || youtubeInfo.startSeconds < 0) {
        issues.push(
            `${formatSongLocation(song, index)}: ` +
            "startSeconds must be a finite number greater than or equal to 0"
        );
    }
    return youtubeInfo;
}

/**
 * 曲データの終了秒数を検証する。nullは動画末尾まで再生する正常値として扱う。
 * @param song 検証中の曲データ
 * @param index 変換後の曲配列上の位置
 * @param startSeconds URLから抽出した開始秒数
 * @param issues 検出した問題の追加先
 */
function validateEndSeconds(
    song: Record<string, unknown>,
    index: number,
    startSeconds: number,
    issues: string[]
): void {
    if (song.endSeconds === null || song.endSeconds === undefined) return;
    if (typeof song.endSeconds !== "number" ||
        !Number.isFinite(song.endSeconds) ||
        song.endSeconds < 0) {
        issues.push(
            `${formatSongLocation(song, index)}: ` +
            "endSeconds must be a finite number greater than or equal to 0"
        );
        return;
    }
    if (song.endSeconds <= startSeconds) {
        issues.push(`${formatSongLocation(song, index)}: endSeconds must be greater than startSeconds`);
    }
}

/**
 * マスターCSVから変換された公開対象曲の品質条件を全件検証する。
 * @param songs CSVから変換された曲データ
 * @returns CSV上の修正位置を含む問題一覧
 */
export function validateSongsDataQuality(songs: readonly unknown[]): string[] {
    const issues: string[] = [];
    for (let index = 0; index < songs.length; index += 1) {
        const song = songs[index];
        if (!song || typeof song !== "object" || Array.isArray(song)) {
            issues.push(`CSV ${index + 2}行目: song must be an object, got ${formatIssueValue(song)}`);
            continue;
        }
        const songRecord = song as Record<string, unknown>;
        validateRequiredTextFields(songRecord, index, issues);
        const youtubeInfo = validateSongYoutubeFields(songRecord, index, issues);
        validateEndSeconds(songRecord, index, youtubeInfo.startSeconds, issues);
    }
    return issues;
}

/**
 * マスターCSVから変換された公開対象曲を検証し、問題があればJSON生成前に停止する。
 * @param songs CSVから変換された曲データ
 */
export function assertSongsDataQuality(songs: readonly unknown[]): void {
    const issues = validateSongsDataQuality(songs);
    if (issues.length > 0) {
        throw new Error(`CSV song data validation failed:\n${issues.join("\n")}`);
    }
}
