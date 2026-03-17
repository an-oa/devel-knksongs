/**
 * フォーマット値に対応するフィルタ表示ラベルを返す。
 * @param {*} format
 */
export function getFormatFilterLabel(format) {
    if (format === "歌みた") return "オリソン/歌みた";
    return format;
}

