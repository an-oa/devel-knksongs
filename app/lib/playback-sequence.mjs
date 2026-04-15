/**
 * 現在の結果順から、次に再生候補となる曲キー列を返す。
 * @param {*} results
 * @param {string} currentSongKey
 * @param {boolean} shouldLoop
 * @returns {string[]}
 */
export function getSequentialPlaybackCandidates(results, currentSongKey, shouldLoop) {
    if (!Array.isArray(results) || results.length === 0) return [];
    const currentIndex = results.findIndex((row) => row && row.songKey === currentSongKey);
    if (currentIndex === -1) return [];

    const candidates = [];
    for (let index = currentIndex + 1; index < results.length; index++) {
        const songKey = results[index] && results[index].songKey;
        if (typeof songKey === "string" && songKey) {
            candidates.push(songKey);
        }
    }
    if (!shouldLoop) return candidates;

    for (let index = 0; index <= currentIndex; index++) {
        const songKey = results[index] && results[index].songKey;
        if (typeof songKey === "string" && songKey) {
            candidates.push(songKey);
        }
    }
    return candidates;
}

/**
 * 現在の再生設定に応じて、次に再生を試みる曲キー列を返す。
 * @param {*} results
 * @param {string} currentSongKey
 * @param {{ continuousPlayback?: boolean, loopPlayback?: boolean } | undefined} options
 * @returns {string[]}
 */
export function getPlaybackContinuationCandidates(results, currentSongKey, options) {
    const settings = options || {};
    const isContinuous = Boolean(settings.continuousPlayback);
    const isLoop = Boolean(settings.loopPlayback);
    if (!isContinuous) {
        return isLoop && currentSongKey ? [currentSongKey] : [];
    }
    return getSequentialPlaybackCandidates(results, currentSongKey, isLoop);
}
