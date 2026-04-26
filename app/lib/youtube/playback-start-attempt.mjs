import { isHtmlElement } from "../dom-utils.mjs?v=11";

export const DEFAULT_PLAYBACK_START_TIMEOUT_MS = 5000;
export const DEFAULT_PLAYBACK_SETUP_TIMEOUT_MS = 10000;
export const YOUTUBE_PLAYBACK_START_UNCONFIRMED = "unconfirmed";

/**
 * YouTube 埋め込み再生の開始待ちを管理する。
 * @param {{
 *   getSharedPlaybackState: Function,
 *   getThumbForSession: Function,
 *   getSessionIdForThumb: Function,
 *   isCurrentSession: Function,
 *   handleStartFailure: Function,
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
        handleStartFailure
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
            const timeoutResult = reason === "start-timeout"
                ? YOUTUBE_PLAYBACK_START_UNCONFIRMED
                : false;
            const didSettle = settle(attempt.sessionId, timeoutResult);
            if (!didSettle) return;
            if (timeoutResult === YOUTUBE_PLAYBACK_START_UNCONFIRMED) return;
            const thumbDiv = isHtmlElement(attempt.context.thumbDiv)
                ? attempt.context.thumbDiv
                : getThumbForSession(attempt.sessionId);
            if (!isHtmlElement(thumbDiv)) return;
            if (!isCurrentSession(thumbDiv, attempt.sessionId)) return;
            handleStartFailure(thumbDiv, {
                playbackMode: attempt.context.playbackMode,
                reason
            });
        }, timeoutDurationMs);
        if (timeoutId && typeof timeoutId.unref === "function") {
            timeoutId.unref();
        }
        return timeoutId;
    }

    /**
     * 指定セッションの再生開始待ちを完了扱いにする。
     * @param {number | undefined} sessionId
     * @param {boolean | string} playbackResult
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
        if (playbackResult === YOUTUBE_PLAYBACK_START_UNCONFIRMED) {
            attempt.resolve(YOUTUBE_PLAYBACK_START_UNCONFIRMED);
            return true;
        }
        attempt.resolve(Boolean(playbackResult));
        return true;
    }

    /**
     * 指定セッションの再生開始待ち Promise を作成する。
     * @param {number} sessionId
     * @param {{ thumbDiv?: *, playbackMode?: string } | undefined} inputContext
     * @returns {Promise<boolean>}
     */
    function create(sessionId, inputContext) {
        const context = inputContext || {};
        settle(undefined, false);
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
        return settle(getSessionIdForThumb(thumbDiv), false);
    }

    return {
        create,
        armStartTimeout,
        settle,
        cancelForThumb
    };
}
