import { getPlaybackContinuationCandidates } from "../lib/playback-sequence.mjs?v=11";
import { getPlaybackUiState } from "../lib/ui-slices.mjs?v=11";

/**
 * 再生終了後の継続再生と追従スクロールを制御する。
 * @param {{ data: *, ui: *, callbacks: { playSongByKey: Function, scrollSongIntoView: Function } }} input
 */
export function createPlaybackSessionController({ data, ui, callbacks }) {
    const playbackUi = getPlaybackUiState(ui);
    const playSongByKey = callbacks.playSongByKey;
    const scrollSongIntoView = callbacks.scrollSongIntoView;

    /**
     * 再生系デバッグログの有効状態を返す。
     * @returns {boolean}
     */
    function isPlaybackDebugEnabled() {
        try {
            if (window.__KNK_DEBUG_YOUTUBE__ === true) return true;
            return localStorage.getItem("debugYoutubePlayer") === "true";
        } catch {
            return false;
        }
    }

    /**
     * 継続再生フローのデバッグログを出力する。
     * @param {string} message
     * @param {*} details
     */
    function debugPlaybackSession(message, details) {
        if (!isPlaybackDebugEnabled()) return;
        if (details === undefined) {
            console.debug("[playback-session]", message);
            return;
        }
        console.debug("[playback-session]", message, details);
    }

    /**
     * 現在の再生設定に従い、終了した曲の次候補を順に再生する。
     * @param {string} finishedSongKey
     * @returns {Promise<boolean>}
     */
    async function continuePlayback(finishedSongKey) {
        const candidates = getPlaybackContinuationCandidates(
            data.currentResults,
            finishedSongKey,
            {
                continuousPlayback: playbackUi.continuousPlayback,
                loopPlayback: playbackUi.loopPlayback
            }
        );
        debugPlaybackSession("continuePlayback candidates", {
            finishedSongKey,
            candidates,
            continuousPlayback: playbackUi.continuousPlayback,
            loopPlayback: playbackUi.loopPlayback
        });
        for (const songKey of candidates) {
            const didStart = await Promise.resolve(playSongByKey(songKey));
            debugPlaybackSession("continuePlayback playSongByKey result", {
                finishedSongKey,
                candidateSongKey: songKey,
                didStart,
                hasActiveThumb: Boolean(playbackUi.activeThumb)
            });
            if (didStart) {
                scrollSongIntoView(songKey);
                debugPlaybackSession("continuePlayback advanced", {
                    finishedSongKey,
                    nextSongKey: songKey
                });
                return true;
            }
            if (playbackUi.activeThumb) {
                debugPlaybackSession("continuePlayback stopped because playback was taken over", {
                    finishedSongKey,
                    candidateSongKey: songKey
                });
                return false;
            }
        }
        debugPlaybackSession("continuePlayback exhausted candidates", {
            finishedSongKey
        });
        return false;
    }

    return {
        continuePlayback
    };
}
