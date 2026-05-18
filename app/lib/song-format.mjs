/**
 * 形式が「歌みた」かどうかを判定する。
 * @param {unknown} format
 * @returns {boolean}
 */
function isUtamitaFormat(format) {
    return format === "歌みた";
}

/**
 * 形式が「オリ曲」かどうかを判定する。
 * @param {unknown} format
 * @returns {boolean}
 */
export function isOriginalSongFormat(format) {
    return format === "オリ曲";
}

/**
 * 形式が「歌みた」系かどうかを判定する。
 * 「オリ曲」は「歌みた」と同等に扱う。
 * @param {unknown} format
 * @returns {boolean}
 */
export function isUtamitaEquivalentFormat(format) {
    return isUtamitaFormat(format) || isOriginalSongFormat(format);
}

/**
 * 形式が「配信」かどうかを判定する。
 * @param {unknown} format
 * @returns {boolean}
 */
export function isStreamFormat(format) {
    return format === "配信";
}

/**
 * 形式が「ショート」かどうかを判定する。
 * @param {unknown} format
 * @returns {boolean}
 */
export function isShortFormat(format) {
    return format === "ショート";
}

/**
 * 指定フォーマットが現在の選択状態に含まれるかを判定する。
 * 「オリ曲」は「歌みた」と同じ選択肢で通す。
 * @param {unknown} format
 * @param {Set<string>} selectedFormats
 * @returns {boolean}
 */
export function matchesSelectedFormat(format, selectedFormats) {
    if (selectedFormats.has(format)) return true;
    if (!isUtamitaEquivalentFormat(format)) return false;
    return selectedFormats.has("歌みた") || selectedFormats.has("オリ曲");
}
