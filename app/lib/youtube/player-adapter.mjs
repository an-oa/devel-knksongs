import { isHtmlElement } from "../dom-utils.mjs?v=15";
import { YT_EMBED_HOST } from "./embed.mjs?v=15";

/**
 * 共有 iframe に YouTube Iframe API の Player を紐付ける adapter を作成する。
 * @param {{
 *   getSharedPlaybackState: Function,
 *   setPendingAttach: Function,
 *   setSessionId: Function,
 *   ensureReady: Function,
 *   applyIframeAttributes: Function,
 *   syncIframe: Function,
 *   handleStateChange: Function,
 *   handlePlayerError: Function,
 *   handleAttachFailure?: Function,
 *   debug?: Function
 * }} input
 * @returns {{ attach: Function }}
 */
export function createYoutubePlayerAdapter(input) {
    const {
        getSharedPlaybackState,
        setPendingAttach,
        setSessionId,
        ensureReady,
        applyIframeAttributes,
        syncIframe,
        handleStateChange,
        handlePlayerError,
        handleAttachFailure,
        debug
    } = input;

    /**
     * 生成済み iframe へ YouTube プレイヤーを紐付ける。
     * @param {*} iframe
     * @param {number} playbackSessionId
     * @returns {Promise<*>}
     */
    function attach(iframe, playbackSessionId) {
        const sharedPlayback = getSharedPlaybackState();
        setPendingAttach(iframe, playbackSessionId);
        if (sharedPlayback.playerPromise) {
            setSessionId(playbackSessionId);
            if (typeof debug === "function") {
                debug("attachPlayer waiting for existing playerPromise", { playbackSessionId });
            }
            return sharedPlayback.playerPromise;
        }
        setSessionId(playbackSessionId);
        if (typeof debug === "function") {
            debug("attachPlayer creating player", { playbackSessionId });
        }
        sharedPlayback.playerPromise = ensureReady().then(() => {
            const latestSharedPlayback = getSharedPlaybackState();
            const pendingAttach = latestSharedPlayback.pendingAttach;
            if (!pendingAttach) return null;
            const nextIframe = pendingAttach.iframe;
            const nextPlaybackSessionId = pendingAttach.playbackSessionId;
            setSessionId(nextPlaybackSessionId);
            if (!isHtmlElement(nextIframe)) return null;
            if (!document.body.contains(nextIframe)) return null;
            if (latestSharedPlayback.parkingNode && nextIframe.parentElement === latestSharedPlayback.parkingNode) {
                return null;
            }
            if (latestSharedPlayback.player) return latestSharedPlayback.player;
            latestSharedPlayback.player = new window.YT.Player(nextIframe, {
                host: YT_EMBED_HOST,
                events: {
                    onReady: (event) => {
                        applyIframeAttributes(
                            event && event.target && typeof event.target.getIframe === "function"
                                ? event.target.getIframe()
                                : nextIframe
                        );
                    },
                    onStateChange: (event) => handleStateChange(event, nextPlaybackSessionId),
                    onError: (event) => handlePlayerError(event, nextPlaybackSessionId)
                }
            });
            applyIframeAttributes(nextIframe);
            syncIframe();
            if (typeof debug === "function") {
                debug("attachPlayer created player", { playbackSessionId: nextPlaybackSessionId });
            }
            return latestSharedPlayback.player;
        }).catch((error) => {
            if (typeof handleAttachFailure === "function") {
                return handleAttachFailure(error, playbackSessionId);
            }
            throw error;
        }).finally(() => {
            sharedPlayback.playerPromise = null;
        });
        return sharedPlayback.playerPromise;
    }

    return { attach };
}
