import { isHtmlElement } from "../dom-utils.mjs?v=12";

export const DEFAULT_PLAYBACK_START_TIMEOUT_MS = 4000;

/**
 * YouTube 埋め込み再生の開始待ちを管理する。
 * @param {{
 *   getSharedPlaybackState: Function,
 *   getThumbForSession: Function,
 *   getSessionIdForThumb: Function,
 *   isCurrentSession: Function,
 *   handleStartFailure: Function,
 *   timeoutMs?: number
 * }} input
 * @returns {{ create: Function, settle: Function, cancelForThumb: Function }}
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

    /**
     * 指定セッションの再生開始待ちを完了扱いにする。
     * @param {number | undefined} sessionId
     * @param {boolean} didStart
     * @returns {boolean}
     */
    function settle(sessionId, didStart) {
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
        attempt.resolve(Boolean(didStart));
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
            const timeoutId = setTimeout(() => {
                const didSettle = settle(sessionId, false);
                if (!didSettle) return;
                const thumbDiv = isHtmlElement(context.thumbDiv)
                    ? context.thumbDiv
                    : getThumbForSession(sessionId);
                if (!isHtmlElement(thumbDiv)) return;
                if (!isCurrentSession(thumbDiv, sessionId)) return;
                handleStartFailure(thumbDiv, {
                    playbackMode: context.playbackMode,
                    reason: "start-timeout"
                });
            }, timeoutMs);
            if (timeoutId && typeof timeoutId.unref === "function") {
                timeoutId.unref();
            }
            getSharedPlaybackState().playbackStartAttempt = {
                sessionId,
                resolve,
                timeoutId
            };
        });
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
        settle,
        cancelForThumb
    };
}
