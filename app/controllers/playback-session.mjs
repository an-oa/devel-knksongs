import { getPlaybackContinuationCandidates } from "../lib/playback-sequence.mjs?v=11";
import { getPlaybackUiState } from "../lib/ui-slices.mjs?v=11";

/**
 * 再生終了後の継続再生と追従スクロールを制御する。
 * @param {{ data: *, ui: * }} input
 */
export function createPlaybackSessionController({ data, ui }) {
    const playbackUi = getPlaybackUiState(ui);
    let playSongByKey = () => false;
    let scrollSongIntoView = () => {};

    /**
     * 再生制御に必要な依存関数を差し替える。
     * @param {{ playSongByKey?: Function, scrollSongIntoView?: Function } | undefined} next
     */
    function setDependencies(next) {
        if (!next) return;
        if (typeof next.playSongByKey === "function") playSongByKey = next.playSongByKey;
        if (typeof next.scrollSongIntoView === "function") scrollSongIntoView = next.scrollSongIntoView;
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
        for (const songKey of candidates) {
            if (await Promise.resolve(playSongByKey(songKey))) {
                scrollSongIntoView(songKey);
                return true;
            }
        }
        return false;
    }

    return {
        setDependencies,
        continuePlayback
    };
}
