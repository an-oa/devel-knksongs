// Generated from app/lib/youtube/playback-state.mts.
// Do not edit this .mjs file by hand; edit the .mts source and run npm run build:ts.

const YOUTUBE_PLAYBACK_PHASE_IDLE = "idle";
const YOUTUBE_PLAYBACK_PHASE_STARTING = "starting";
const YOUTUBE_PLAYBACK_PHASE_PLAYING = "playing";
/**
 * YouTube 埋め込み再生の状態機械が扱う初期 state を返す。
 * @returns {{ sessionSequence: number, transitionGeneration: number, activeSessionId: number, phase: string }}
 */
export function createYoutubePlaybackState() {
    return {
        sessionSequence: 0,
        transitionGeneration: 0,
        activeSessionId: 0,
        phase: YOUTUBE_PLAYBACK_PHASE_IDLE
    };
}
/**
 * 指定セッションが現在の再生 state に対して有効か判定する。
 * @param {{ activeSessionId: number }} state
 * @param {number} sessionId
 * @returns {boolean}
 */
export function isYoutubePlaybackSessionActive(state, sessionId) {
    return Number.isFinite(sessionId) && sessionId > 0 && state.activeSessionId === sessionId;
}
/**
 * YouTube 埋め込み再生の状態機械を 1 ステップ進める。
 * @param {{ sessionSequence: number, transitionGeneration: number, activeSessionId: number, phase: string }} state
 * @param {{ type: string, sessionId?: number, preserveTransitionGeneration?: boolean }} event
 * @returns {{ sessionSequence: number, transitionGeneration: number, activeSessionId: number, phase: string }}
 */
export function reduceYoutubePlaybackState(state, event) {
    const currentState = state || createYoutubePlaybackState();
    const targetSessionId = Number.isFinite(event && event.sessionId) ? event.sessionId : 0;
    switch (event && event.type) {
        case "REQUEST_PLAYBACK": {
            const nextSessionId = currentState.sessionSequence + 1;
            return {
                ...currentState,
                sessionSequence: nextSessionId,
                transitionGeneration: currentState.transitionGeneration + 1,
                activeSessionId: nextSessionId,
                phase: YOUTUBE_PLAYBACK_PHASE_STARTING
            };
        }
        case "PLAYBACK_STARTED":
            if (!isYoutubePlaybackSessionActive(currentState, targetSessionId))
                return currentState;
            return {
                ...currentState,
                phase: YOUTUBE_PLAYBACK_PHASE_PLAYING
            };
        case "PLAYBACK_ENDED":
            if (!isYoutubePlaybackSessionActive(currentState, targetSessionId))
                return currentState;
            return {
                ...currentState,
                transitionGeneration: currentState.transitionGeneration + 1,
                activeSessionId: 0,
                phase: YOUTUBE_PLAYBACK_PHASE_IDLE
            };
        case "RESTORE_PLAYBACK":
            if (targetSessionId > 0 && !isYoutubePlaybackSessionActive(currentState, targetSessionId)) {
                return currentState;
            }
            return {
                ...currentState,
                transitionGeneration: event && event.preserveTransitionGeneration
                    ? currentState.transitionGeneration
                    : currentState.transitionGeneration + 1,
                activeSessionId: 0,
                phase: YOUTUBE_PLAYBACK_PHASE_IDLE
            };
        case "CLEAR_PLAYBACK":
            if (targetSessionId > 0 && !isYoutubePlaybackSessionActive(currentState, targetSessionId)) {
                return currentState;
            }
            return {
                ...currentState,
                activeSessionId: 0,
                phase: YOUTUBE_PLAYBACK_PHASE_IDLE
            };
        default:
            return currentState;
    }
}
