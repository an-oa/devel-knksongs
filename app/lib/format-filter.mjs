// Generated from app/lib/format-filter.mts.
// Do not edit this .mjs file by hand; edit the .mts source and run npm run build:ts.

/**
 * フォーマット値に対応するフィルタ表示ラベルを返す。
 * @param {string} format
 * @returns {string}
 */
export function getFormatFilterLabel(format) {
    if (format === "歌みた")
        return "オリ曲/歌みた";
    return format;
}
