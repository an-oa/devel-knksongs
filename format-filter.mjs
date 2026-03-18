/**
 * フォーマット値に対応するフィルタ表示ラベルを返す。
 * @param {*} format
 */
export function getFormatFilterLabel(format) {
    if (format === "歌みた") return "オリ曲/歌みた";
    return format;
}
