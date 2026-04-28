/**
 * 再生系デバッグログの有効状態を返す。
 * @returns {boolean}
 */
export function isPlaybackDebugEnabled() {
    try {
        if (window.__KNK_DEBUG_YOUTUBE__ === true) return true;
        return localStorage.getItem("debugYoutubePlayer") === "true";
    } catch {
        return false;
    }
}

/**
 * autoplay の開始待ちに fallback を使うデバッグ設定の有効状態を返す。
 * @returns {boolean}
 */
export function isAutoplayStartFallbackEnabled() {
    try {
        if (window.__KNK_AUTOPLAY_START_FALLBACK__ === true) return true;
        return localStorage.getItem("debugAutoplayStartFallback") === "true";
    } catch {
        return false;
    }
}

/**
 * 指定スコープ付きの再生系デバッグログを出力する。
 * @param {string} scope
 * @param {string} message
 * @param {*} details
 */
export function debugPlayback(scope, message, details) {
    if (!isPlaybackDebugEnabled()) return;
    if (details === undefined) {
        console.debug(`[${scope}]`, message);
        return;
    }
    console.debug(`[${scope}]`, message, details);
}

/**
 * 指定スコープ付きの再生系トレースログを出力する。
 * @param {string} scope
 * @param {string} message
 * @param {*} details
 */
export function tracePlayback(scope, message, details) {
    if (!isPlaybackDebugEnabled()) return;
    debugPlayback(scope, message, details);
    console.trace(`[${scope} trace]`, message);
}
