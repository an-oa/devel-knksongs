import { getPlaybackContinuationCandidates } from "../lib/playback-sequence.mjs?v=17";
import { debugPlayback } from "../lib/playback-debug.mjs?v=17";
import { getPlaybackUiState } from "../lib/ui-slices.mjs?v=17";
import {
    isYoutubePlaybackStarted,
    isYoutubePlaybackStartUnconfirmed
} from "../lib/youtube/playback-start-attempt.mjs?v=17";

/**
 * 再生終了後の継続再生と追従スクロールを制御する。
 * @param {{ data: *, ui: *, callbacks: { playSongByKey: Function, scrollSongIntoView: Function } }} input
 */
export function createPlaybackSessionController({ data, ui, callbacks }) {
    const playbackUi = getPlaybackUiState(ui);
    const playSongByKey = callbacks.playSongByKey;
    const scrollSongIntoView = callbacks.scrollSongIntoView;

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
        debugPlayback("playback-session", "continuePlayback candidates", {
            finishedSongKey,
            candidates,
            continuousPlayback: playbackUi.continuousPlayback,
            loopPlayback: playbackUi.loopPlayback
        });
        for (const songKey of candidates) {
            const playbackResult = await Promise.resolve(playSongByKey(songKey));
            const didStartPlayback = isYoutubePlaybackStarted(playbackResult);
            const isStartUnconfirmed = isYoutubePlaybackStartUnconfirmed(playbackResult);
            const wasPlaybackTakenOver = Boolean(playbackUi.activeThumb);
            debugPlayback("playback-session", "continuePlayback playSongByKey result", {
                finishedSongKey,
                candidateSongKey: songKey,
                playbackResult,
                hasActiveThumb: wasPlaybackTakenOver
            });
            if (
                didStartPlayback ||
                isStartUnconfirmed ||
                !wasPlaybackTakenOver
            ) {
                scrollSongIntoView(songKey);
            }
            if (didStartPlayback) {
                debugPlayback("playback-session", "continuePlayback advanced", {
                    finishedSongKey,
                    nextSongKey: songKey
                });
                return true;
            }
            if (isStartUnconfirmed) {
                debugPlayback("playback-session", "continuePlayback stopped because playback start is unconfirmed", {
                    finishedSongKey,
                    candidateSongKey: songKey
                });
                return false;
            }
            if (wasPlaybackTakenOver) {
                debugPlayback("playback-session", "continuePlayback stopped because playback was taken over", {
                    finishedSongKey,
                    candidateSongKey: songKey
                });
                return false;
            }
        }
        debugPlayback("playback-session", "continuePlayback exhausted candidates", {
            finishedSongKey
        });
        return false;
    }

    return {
        continuePlayback
    };
}
