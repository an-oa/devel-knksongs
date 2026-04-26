/**
 * YouTube 再生開始が未確定のままになったセッションを管理する。
 * @param {{ getSharedPlaybackState: Function }} input
 * @returns {{ mark: Function, clear: Function, consume: Function }}
 */
export function createYoutubeUnconfirmedPlaybackStartManager(input) {
    const getSharedPlaybackState = input.getSharedPlaybackState;

    /**
     * 指定セッションを再生開始未確定として記録する。
     * @param {number} sessionId
     */
    function mark(sessionId) {
        const sharedPlayback = getSharedPlaybackState();
        sharedPlayback.unconfirmedPlaybackStartSessionId = Number.isFinite(sessionId) && sessionId > 0
            ? sessionId
            : 0;
    }

    /**
     * 指定セッションの再生開始未確定記録を解除する。
     * @param {number | undefined} sessionId
     * @returns {boolean}
     */
    function clear(sessionId) {
        const sharedPlayback = getSharedPlaybackState();
        const unconfirmedSessionId = sharedPlayback.unconfirmedPlaybackStartSessionId || 0;
        if (!unconfirmedSessionId) return false;
        if (Number.isFinite(sessionId) && sessionId > 0 && unconfirmedSessionId !== sessionId) {
            return false;
        }
        sharedPlayback.unconfirmedPlaybackStartSessionId = 0;
        return true;
    }

    /**
     * 指定セッションの再生開始未確定記録を読み取り、該当すれば解除する。
     * @param {number} sessionId
     * @returns {boolean}
     */
    function consume(sessionId) {
        return clear(sessionId);
    }

    return {
        mark,
        clear,
        consume
    };
}
