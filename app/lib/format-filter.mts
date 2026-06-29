/**
 * フォーマット値に対応するフィルタ表示ラベルを返す。
 * @param {string} format
 * @returns {string}
 */
export function getFormatFilterLabel(format: string): string {
    if (format === "歌みた") return "オリ曲/歌みた";
    return format;
}
