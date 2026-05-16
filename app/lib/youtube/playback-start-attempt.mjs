import { isHtmlElement } from "../dom-utils.mjs?v=18";
import {
    debugPlayback,
    isAutoplayStartFallbackEnabled
} from "../playback-debug.mjs?v=18";

export const DEFAULT_PLAYBACK_START_TIMEOUT_MS = 5000;
export const DEFAULT_PLAYBACK_SETUP_TIMEOUT_MS = 10000;
export const YOUTUBE_PLAYBACK_START_STATUS = Object.freeze({
    STARTED: "started",
    FAILED: "failed",
    UNCONFIRMED: "unconfirmed"
});

/**
 * @typedef {"started" | "failed" | "unconfirmed"} YoutubePlaybackStartStatus
 */

/**
 * @typedef {{ status: YoutubePlaybackStartStatus }} YoutubePlaybackStartResult
 */

/**
 * 再生開始結果を表すオブジェクトを作成する。
 * @param {string} status
 * @returns {YoutubePlaybackStartResult}
 */
export function createYoutubePlaybackStartResult(status) {
    switch (status) {
    case YOUTUBE_PLAYBACK_START_STATUS.STARTED:
    case YOUTUBE_PLAYBACK_START_STATUS.UNCONFIRMED:
        return { status };
    default:
        return { status: YOUTUBE_PLAYBACK_START_STATUS.FAILED };
    }
}

/**
 * 再生開始結果から status を返す。
 * @param {YoutubePlaybackStartResult | boolean | null | undefined} playbackResult
 * @returns {YoutubePlaybackStartStatus}
 */
function getYoutubePlaybackStartStatus(playbackResult) {
    if (playbackResult && typeof playbackResult === "object" && typeof playbackResult.status === "string") {
        return createYoutubePlaybackStartResult(playbackResult.status).status;
    }
    return playbackResult === true
        ? YOUTUBE_PLAYBACK_START_STATUS.STARTED
        : YOUTUBE_PLAYBACK_START_STATUS.FAILED;
}

/**
 * 再生開始結果をオブジェクト形式へ正規化する。
 * @param {YoutubePlaybackStartResult | boolean | null | undefined} playbackResult
 * @returns {YoutubePlaybackStartResult}
 */
function normalizeYoutubePlaybackStartResult(playbackResult) {
    return createYoutubePlaybackStartResult(getYoutubePlaybackStartStatus(playbackResult));
}

/**
 * 再生開始結果が開始済みか返す。
 * @param {YoutubePlaybackStartResult | boolean | undefined} playbackResult
 * @returns {boolean}
 */
export function isYoutubePlaybackStarted(playbackResult) {
    return getYoutubePlaybackStartStatus(playbackResult) === YOUTUBE_PLAYBACK_START_STATUS.STARTED;
}

/**
 * 再生開始結果が未確定か返す。
 * @param {YoutubePlaybackStartResult | boolean | undefined} playbackResult
 * @returns {boolean}
 */
export function isYoutubePlaybackStartUnconfirmed(playbackResult) {
    return getYoutubePlaybackStartStatus(playbackResult) === YOUTUBE_PLAYBACK_START_STATUS.UNCONFIRMED;
}

/**
 * YouTube 埋め込み再生の開始待ちを管理する。
 * @param {{
 *   getSharedPlaybackState: Function,
 *   getThumbForSession: Function,
 *   getSessionIdForThumb: Function,
 *   isCurrentSession: Function,
 *   handleStartFailure: Function,
 *   markUnconfirmedStart: Function,
 *   clearUnconfirmedStart: Function,
 *   timeoutMs?: number,
 *   setupTimeoutMs?: number
 * }} input
 * @returns {{ create: Function, armStartTimeout: Function, settle: Function, cancelForThumb: Function }}
 */
export function createYoutubePlaybackStartAttemptManager(input) {
    const {
        getSharedPlaybackState,
        getThumbForSession,
        getSessionIdForThumb,
        isCurrentSession,
        handleStartFailure,
        markUnconfirmedStart,
        clearUnconfirmedStart
    } = input;
    const timeoutMs = Number.isFinite(input.timeoutMs)
        ? input.timeoutMs
        : DEFAULT_PLAYBACK_START_TIMEOUT_MS;
    const setupTimeoutMs = Number.isFinite(input.setupTimeoutMs)
        ? input.setupTimeoutMs
        : DEFAULT_PLAYBACK_SETUP_TIMEOUT_MS;

    /**
     * 再生開始待ちのタイムアウトを開始する。
     * @param {*} attempt
     * @param {number} timeoutDurationMs
     * @param {string} reason
     * @returns {*}
     */
    function startTimeout(attempt, timeoutDurationMs, reason) {
        const timeoutId = setTimeout(() => {
            const shouldUseAutoplayStartFallback =
                reason === "start-timeout" &&
                attempt.context.playbackMode === "autoplay" &&
                isAutoplayStartFallbackEnabled();
            const timeoutResult = reason === "start-timeout" && !shouldUseAutoplayStartFallback
                ? createYoutubePlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.UNCONFIRMED)
                : createYoutubePlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED);
            const didSettle = settle(attempt.sessionId, timeoutResult);
            if (!didSettle) return;
            if (isYoutubePlaybackStartUnconfirmed(timeoutResult)) return;
            const thumbDiv = isHtmlElement(attempt.context.thumbDiv)
                ? attempt.context.thumbDiv
                : getThumbForSession(attempt.sessionId);
            if (!isHtmlElement(thumbDiv)) return;
            if (!isCurrentSession(thumbDiv, attempt.sessionId)) return;
            if (shouldUseAutoplayStartFallback) {
                debugPlayback("youtube", "debug autoplay start fallback", {
                    reason,
                    playbackMode: attempt.context.playbackMode
                });
            }
            const failureOptions = {
                playbackMode: attempt.context.playbackMode,
                reason: shouldUseAutoplayStartFallback ? "debug-autoplay-start-fallback" : reason
            };
            if (shouldUseAutoplayStartFallback) {
                failureOptions.wasPlaybackStartUnconfirmed = true;
            }
            handleStartFailure(thumbDiv, failureOptions);
        }, timeoutDurationMs);
        if (timeoutId && typeof timeoutId.unref === "function") {
            timeoutId.unref();
        }
        return timeoutId;
    }

    /**
     * 指定セッションの再生開始待ちを完了扱いにする。
     * @param {number | undefined} sessionId
     * @param {YoutubePlaybackStartResult} playbackResult
     * @returns {boolean}
     */
    function settle(sessionId, playbackResult) {
        const sharedPlayback = getSharedPlaybackState();
        const attempt = sharedPlayback.playbackStartAttempt;
        if (!attempt) return false;
        if (Number.isFinite(sessionId) && sessionId > 0 && attempt.sessionId !== sessionId) {
            return false;
        }
        sharedPlayback.playbackStartAttempt = null;
        if (attempt.timeoutId) {
            clearTimeout(attempt.timeoutId);
        }
        const normalizedResult = normalizeYoutubePlaybackStartResult(playbackResult);
        if (isYoutubePlaybackStartUnconfirmed(normalizedResult)) {
            markUnconfirmedStart(attempt.sessionId);
            attempt.resolve(normalizedResult);
            return true;
        }
        clearUnconfirmedStart(attempt.sessionId);
        attempt.resolve(normalizedResult);
        return true;
    }

    /**
     * 指定セッションの再生開始待ち Promise を作成する。
     * @param {number} sessionId
     * @param {{ thumbDiv?: *, playbackMode?: string } | undefined} inputContext
     * @returns {Promise<YoutubePlaybackStartResult>}
     */
    function create(sessionId, inputContext) {
        const context = inputContext || {};
        settle(undefined, createYoutubePlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED));
        clearUnconfirmedStart();
        return new Promise((resolve) => {
            const attempt = {
                sessionId,
                resolve,
                timeoutId: null,
                context
            };
            attempt.timeoutId = startTimeout(attempt, setupTimeoutMs, "setup-timeout");
            getSharedPlaybackState().playbackStartAttempt = attempt;
        });
    }

    /**
     * プレーヤー接続後の再生開始タイムアウトへ切り替える。
     * @param {number} sessionId
     * @returns {boolean}
     */
    function armStartTimeout(sessionId) {
        const sharedPlayback = getSharedPlaybackState();
        const attempt = sharedPlayback.playbackStartAttempt;
        if (!attempt) return false;
        if (Number.isFinite(sessionId) && sessionId > 0 && attempt.sessionId !== sessionId) {
            return false;
        }
        if (attempt.timeoutId) {
            clearTimeout(attempt.timeoutId);
        }
        attempt.timeoutId = startTimeout(attempt, timeoutMs, "start-timeout");
        return true;
    }

    /**
     * 指定サムネイルに紐づく再生開始待ちを失敗扱いで閉じる。
     * @param {*} thumbDiv
     * @returns {boolean}
     */
    function cancelForThumb(thumbDiv) {
        const sessionId = getSessionIdForThumb(thumbDiv);
        const didClearUnconfirmedStart = clearUnconfirmedStart(sessionId);
        return settle(sessionId, createYoutubePlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED)) ||
            didClearUnconfirmedStart;
    }

    return {
        create,
        armStartTimeout,
        settle,
        cancelForThumb
    };
}
