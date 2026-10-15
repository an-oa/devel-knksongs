import { isDebugFlagEnabled, writeDebugLog } from "./debug-log.mjs";

/**
 * 再生系デバッグログの有効状態を返す。
 */
function isPlaybackDebugEnabled(): boolean {
    return isDebugFlagEnabled("__KNK_DEBUG_YOUTUBE__", "debugYoutubePlayer");
}

/**
 * autoplay の開始待ちに fallback を使うデバッグ設定の有効状態を返す。
 */
export function isAutoplayStartFallbackEnabled(): boolean {
    return isDebugFlagEnabled("__KNK_AUTOPLAY_START_FALLBACK__", "debugAutoplayStartFallback");
}

/**
 * 指定スコープ付きの再生系デバッグログを出力する。
 * @param scope ログの出どころ
 * @param message ログ本文
 * @param details 付加情報
 */
export function debugPlayback(scope: string, message: string, details?: unknown) {
    if (!isPlaybackDebugEnabled()) return;
    writeDebugLog(`[${scope}]`, message, details);
}

/**
 * 指定スコープ付きの再生系トレースログを出力する。
 * @param {string} scope
 * @param {string} message
 * @param {unknown} details
 */
export function tracePlayback(scope: string, message: string, details?: unknown) {
    if (!isPlaybackDebugEnabled()) return;
    debugPlayback(scope, message, details);
    console.trace(`[${scope} trace]`, message);
}
