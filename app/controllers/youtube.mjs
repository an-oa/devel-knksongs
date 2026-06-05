// @ts-check

import { createLayoutRefreshScheduler } from "../lib/layout-anchor.mjs?v=23";
import { canUseDom, getHeaderHeight, isHtmlElement } from "../lib/dom-utils.mjs?v=23";
import { debugPlayback, tracePlayback } from "../lib/playback-debug.mjs?v=23";
import { getPlaybackUiState } from "../lib/ui-slices.mjs?v=23";
import {
    applyYoutubePlayerIframeAttributes,
    buildYoutubeEmbedUrl,
    createYoutubeIframeApiLoader
} from "../lib/youtube/embed.mjs?v=23";
import {
    destroyYoutubeSharedPlayback,
    ensureYoutubeSharedPlaybackElements,
    getYoutubeSharedPlaybackState,
    getYoutubeSharedPlaybackThumb,
    setPendingYoutubeSharedPlaybackAttach,
    setYoutubeSharedPlaybackSessionId,
    syncYoutubeSharedPlaybackIframe
} from "../lib/youtube/shared-playback.mjs?v=23";
import {
    applyYoutubeThumbnailImage,
    createYoutubeThumbnailImage,
    getSongKeyFromYoutubeThumb,
    revealYoutubePlaybackCardIfNeeded,
    setYoutubeThumbnailExpandedCardState,
    setYoutubeThumbnailOrientation,
    setYoutubeThumbnailPlaybackState,
    shouldLoadYoutubeThumbnailNow
} from "../lib/youtube/thumbnail.mjs?v=23";
import {
    createYoutubePlaybackState,
    isYoutubePlaybackSessionActive,
    reduceYoutubePlaybackState
} from "../lib/youtube/playback-state.mjs?v=23";
import {
    createYoutubePlaybackStartAttemptManager,
    createYoutubePlaybackStartResult,
    YOUTUBE_PLAYBACK_START_STATUS
} from "../lib/youtube/playback-start-attempt.mjs?v=23";
import { createYoutubeUnconfirmedPlaybackStartManager } from "../lib/youtube/unconfirmed-playback-start.mjs?v=23";
import {
    createYoutubePlayerAdapter
} from "../lib/youtube/player-adapter.mjs?v=23";

export { extractYoutubeInfo } from "../lib/youtube-url.mjs?v=23";

/**
 * @typedef {{
 *   videoId: string,
 *   startSeconds: number,
 *   endSeconds?: number,
 *   isVertical: boolean
 * }} YoutubeTarget
 */

/**
 * @typedef {{
 *   YT_IFRAME_API_SRC: string,
 *   YT_IFRAME_API_SELECTOR: string,
 *   YT_IFRAME_READY_POLL_MS: number,
 *   STOP_PLAYBACK_ON_SCROLL_OUT: boolean
 * }} YoutubeConstants
 */

/**
 * @typedef {AppYoutubeRuntimeState} YoutubeRuntimeState
 */

/**
 * @typedef {{
 *   playback: PlaybackUiRuntimeState
 * }} YoutubeUiState
 */

/**
 * @typedef {{
 *   data?: number,
 *   target?: YoutubePlayerLike
 * }} YoutubePlayerStateEvent
 */

/**
 * @typedef {{
 *   type: string,
 *   sessionId?: number,
 *   preserveTransitionGeneration?: boolean
 * }} YoutubePlaybackStateEvent
 */

/**
 * @typedef {Error & { code?: string }} YoutubePlaybackError
 */

/**
 * @typedef {"manual" | "autoplay" | string} YoutubePlaybackMode
 */

/**
 * @typedef {{
 *   playbackMode?: YoutubePlaybackMode,
 *   reason?: string,
 *   errorCode?: unknown,
 *   sessionId?: number,
 *   wasPlaybackStartUnconfirmed?: boolean
 * }} PlaybackStartFailureOptions
 */

/**
 * @typedef {{ songKey: string, playbackMode: YoutubePlaybackMode, wasPlaybackStartUnconfirmed?: boolean }} PlaybackStartFailedPayload
 */

/**
 * @typedef {{ playbackMode?: YoutubePlaybackMode, revealCard?: boolean }} YoutubePlaybackOptions
 */

/**
 * @typedef {{
 *   ui: YoutubeUiState,
 *   youtube: YoutubeRuntimeState,
 *   constants: YoutubeConstants
 * }} YoutubeControllerInput
 */

/**
 * サムネイル表示と埋め込み再生の制御を行うコントローラーを作成する。
 * @param {YoutubeControllerInput} input
 */
export function createYoutubeController({ ui, youtube, constants }) {
    const {
        YT_IFRAME_API_SRC,
        YT_IFRAME_API_SELECTOR,
        YT_IFRAME_READY_POLL_MS,
        STOP_PLAYBACK_ON_SCROLL_OUT
    } = constants;
    const playbackUi = getPlaybackUiState(ui);
    let refreshLayout = () => {};
    /** @type {(payload: { songKey: string }) => void} */
    let handlePlaybackEnded = () => {};
    /** @type {(payload: PlaybackStartFailedPayload) => void} */
    let handlePlaybackStartFailed = () => {};
    let playbackState = createYoutubePlaybackState();
    const refreshCardLayoutSoon = createLayoutRefreshScheduler(() => refreshLayout);
    const youtubeIframeApiLoader = createYoutubeIframeApiLoader({
        youtube,
        iframeApiSrc: YT_IFRAME_API_SRC,
        iframeApiSelector: YT_IFRAME_API_SELECTOR,
        readyPollMs: YT_IFRAME_READY_POLL_MS
    });

    /**
     * 共有埋め込みプレーヤーの保持領域を返す。
     * @returns {YoutubeSharedPlaybackState}
     */
    function getSharedPlaybackState() {
        return getYoutubeSharedPlaybackState(youtube);
    }

    /**
     * 共有プレーヤーが内部で置き換えた最新の iframe 要素を同期する。
     * @returns {HTMLIFrameElement | null}
     */
    function syncSharedPlaybackIframe() {
        return syncYoutubeSharedPlaybackIframe(youtube);
    }

    /**
     * 共有プレーヤーに紐づく再生セッション ID を設定する。
     * @param {number} sessionId
     */
    function setSharedPlaybackSessionId(sessionId) {
        setYoutubeSharedPlaybackSessionId(youtube, sessionId);
    }

    /**
     * 共有プレーヤー初期化待ち中に使う最新の紐付け要求を保存する。
     * @param {HTMLIFrameElement | null | undefined} iframe
     * @param {number} playbackSessionId
     */
    function setPendingSharedPlaybackAttach(iframe, playbackSessionId) {
        setPendingYoutubeSharedPlaybackAttach(youtube, iframe, playbackSessionId);
    }

    /**
     * 指定セッションの現在の再生サムネイルを返す。
     * @param {number} sessionId
     * @returns {HTMLElement | null}
     */
    function getSharedPlaybackThumb(sessionId) {
        return getYoutubeSharedPlaybackThumb(youtube, sessionId);
    }

    /**
     * 再生開始方法を返す。
     * @param {Element | null | undefined} thumbDiv
     * @returns {YoutubePlaybackMode}
     */
    function getPlaybackMode(thumbDiv) {
        return isHtmlElement(thumbDiv) ? (thumbDiv.dataset.playbackMode || "manual") : "manual";
    }

    /**
     * 再生開始方法をサムネイルへ保存または解除する。
     * @param {HTMLElement} thumbDiv
     * @param {YoutubePlaybackMode | undefined} [playbackMode]
     */
    function setPlaybackMode(thumbDiv, playbackMode = undefined) {
        if (typeof playbackMode === "string" && playbackMode) {
            thumbDiv.dataset.playbackMode = playbackMode;
            return;
        }
        delete thumbDiv.dataset.playbackMode;
    }

    /**
     * 再生状態機械へイベントを適用し、最新 state を返す。
     * @param {YoutubePlaybackStateEvent} event
     * @returns {YoutubePlaybackRuntimeState}
     */
    function applyPlaybackStateEvent(event) {
        playbackState = reduceYoutubePlaybackState(playbackState, event);
        return playbackState;
    }

    /**
     * 再生開始結果オブジェクトを作成する。
     * @param {string} status
     * @returns {{ status: string }}
     */
    function buildPlaybackStartResult(status) {
        return createYoutubePlaybackStartResult(status);
    }

    /**
     * state change event が示す状態と、プレーヤーが現在返す状態の不一致を検出する。
     * 古い再生から遅れて届いたイベントを誤処理しないために使う。
     * @param {YoutubePlayerStateEvent | null | undefined} event
     * @returns {boolean}
     */
    function isStalePlayerStateEvent(event) {
        const target = event && event.target;
        if (!target || typeof target.getPlayerState !== "function") return false;
        try {
            return target.getPlayerState() !== event.data;
        } catch {
            return false;
        }
    }

    const unconfirmedPlaybackStarts = createYoutubeUnconfirmedPlaybackStartManager({
        getSharedPlaybackState
    });

    const playbackStartAttempts = createYoutubePlaybackStartAttemptManager({
        getSharedPlaybackState,
        getThumbForSession: (sessionId) => getSharedPlaybackThumb(sessionId),
        getSessionIdForThumb: (thumbDiv) => getPlaybackSessionId(thumbDiv),
        isCurrentSession: (thumbDiv, sessionId) => isCurrentPlaybackSession(thumbDiv, sessionId),
        handleStartFailure: (thumbDiv, options) => handlePlaybackStartFailure(thumbDiv, options),
        markUnconfirmedStart: (sessionId) => unconfirmedPlaybackStarts.mark(sessionId),
        clearUnconfirmedStart: (sessionId) => unconfirmedPlaybackStarts.clear(sessionId)
    });

    /**
     * レイアウト再計算フックを登録する。
     * @param {() => void} fn
     */
    function setLayoutHook(fn) {
        if (typeof fn === "function") {
            refreshLayout = fn;
        }
    }

    /**
     * 再生終了時の継続再生フックを登録する。
     * @param {(payload: { songKey: string }) => void} fn
     */
    function setPlaybackEndedHook(fn) {
        if (typeof fn === "function") {
            handlePlaybackEnded = fn;
        }
    }

    /**
     * 再生開始失敗時のフックを登録する。
     * @param {(payload: PlaybackStartFailedPayload) => void} fn
     */
    function setPlaybackStartFailedHook(fn) {
        if (typeof fn === "function") {
            handlePlaybackStartFailed = fn;
        }
    }

    /**
     * 実行環境がiOS系WebKitかどうかを判定する。
     */
    function isIOSWebKit() {
        const hasTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
        const webkitTouchCallout = CSS.supports && CSS.supports("-webkit-touch-callout", "none");
        const webkitOverflowScrolling = CSS.supports && CSS.supports("-webkit-overflow-scrolling", "touch");
        const isWebKit = webkitTouchCallout || webkitOverflowScrolling;
        return hasTouch && isWebKit;
    }

    const youtubeApi = {
        ensureReady() {
            return youtubeIframeApiLoader.ensureReady();
        },
        /**
         * 埋め込み再生用の標準 YouTube URL を生成する。
         * @param {YoutubeTarget} yt
         * @returns {string}
         */
        buildEmbedUrl(yt) {
            return buildYoutubeEmbedUrl(yt, {
                endSeconds: getEffectiveEndSeconds(yt),
                autoplay: isEmbeddedPlayerAutoplayEnabled()
            });
        },
        /**
         * プレイヤー状態変化に応じて再生状態表示を更新する。
         * @param {YoutubePlayerStateEvent} event
         * @param {number} playbackSessionId
         */
        handleStateChange(event, playbackSessionId) {
            const thumbDiv = getSharedPlaybackThumb(playbackSessionId);
            debugPlayback("youtube", "player state change", {
                playbackSessionId,
                playerState: event && event.data,
                hasThumb: isHtmlElement(thumbDiv),
                activeSongKey: isHtmlElement(thumbDiv) ? getSongKeyFromYoutubeThumb(thumbDiv) : ""
            });
            if (!isHtmlElement(thumbDiv)) return;
            if (!isCurrentPlaybackSession(thumbDiv, playbackSessionId)) return;
            if (event.data !== window.YT.PlayerState.PLAYING && isStalePlayerStateEvent(event)) {
                debugPlayback("youtube", "ignored stale player state event", {
                    playbackSessionId,
                    playerState: event && event.data,
                    activeSongKey: getSongKeyFromYoutubeThumb(thumbDiv)
                });
                return;
            }
            if (event.data === window.YT.PlayerState.ENDED) {
                const shouldNotifyPlaybackEnded = playbackState.phase === "playing";
                const wasPlaybackStartUnconfirmed = unconfirmedPlaybackStarts.consume(playbackSessionId);
                playbackStartAttempts.settle(
                    playbackSessionId,
                    buildPlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED)
                );
                const endedSongKey = getSongKeyFromYoutubeThumb(thumbDiv);
                const endedPlaybackMode = getPlaybackMode(thumbDiv);
                const endedGeneration = applyPlaybackStateEvent({
                    type: "PLAYBACK_ENDED",
                    sessionId: playbackSessionId
                }).transitionGeneration;
                Promise.resolve(restoreThumbnail(thumbDiv, thumbDiv.dataset.videoId || "", {
                    preserveTransitionGeneration: true
                })).then((restored) => {
                    if (!restored) return;
                    if (endedGeneration !== playbackState.transitionGeneration) return;
                    if (shouldNotifyPlaybackEnded && endedSongKey) {
                        handlePlaybackEnded({ songKey: endedSongKey });
                        return;
                    }
                    if (endedSongKey) {
                        handlePlaybackStartFailed(buildPlaybackStartFailedPayload(endedSongKey, endedPlaybackMode, {
                            wasPlaybackStartUnconfirmed
                        }));
                    }
                });
                return;
            }
            if (event.data === window.YT.PlayerState.PAUSED) {
                setYoutubeThumbnailPlaybackState(thumbDiv, "stopped");
                return;
            }
            if (event.data === window.YT.PlayerState.PLAYING) {
                unconfirmedPlaybackStarts.clear(playbackSessionId);
                playbackStartAttempts.settle(
                    playbackSessionId,
                    buildPlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.STARTED)
                );
                applyPlaybackStateEvent({
                    type: "PLAYBACK_STARTED",
                    sessionId: playbackSessionId
                });
                setYoutubeThumbnailPlaybackState(thumbDiv, "playing");
            }
        },
        /**
         * プレーヤーエラー発生時に再生開始待ちを失敗として処理する。
         * @param {YoutubePlayerStateEvent} event
         * @param {number} playbackSessionId
         */
        handlePlayerError(event, playbackSessionId) {
            const thumbDiv = getSharedPlaybackThumb(playbackSessionId);
            if (!isHtmlElement(thumbDiv)) return;
            if (!isCurrentPlaybackSession(thumbDiv, playbackSessionId)) return;
            const wasPlaybackStartUnconfirmed = unconfirmedPlaybackStarts.consume(playbackSessionId);
            playbackStartAttempts.settle(
                playbackSessionId,
                buildPlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED)
            );
            handlePlaybackStartFailure(thumbDiv, {
                sessionId: playbackSessionId,
                playbackMode: getPlaybackMode(thumbDiv),
                reason: "player-error",
                errorCode: event && event.data,
                wasPlaybackStartUnconfirmed
            });
        }
    };

    const youtubePlayerAdapter = createYoutubePlayerAdapter({
        getSharedPlaybackState,
        setPendingAttach: (iframe, playbackSessionId) => {
            setPendingSharedPlaybackAttach(iframe, playbackSessionId);
        },
        setSessionId: (playbackSessionId) => {
            setSharedPlaybackSessionId(playbackSessionId);
        },
        ensureReady: () => youtubeApi.ensureReady(),
        applyIframeAttributes: (iframe) => applyYoutubePlayerIframeAttributes(iframe),
        syncIframe: () => syncSharedPlaybackIframe(),
        handleStateChange: (event, playbackSessionId) => youtubeApi.handleStateChange(event, playbackSessionId),
        handlePlayerError: (event, playbackSessionId) => youtubeApi.handlePlayerError(event, playbackSessionId),
        handleAttachFailure: (_error, playbackSessionId) => handleYoutubePlayerAttachFailure(playbackSessionId),
        debug: (message, details) => debugPlayback("youtube", message, details)
    });

    /**
     * YouTube Iframe API への接続失敗時に再生方針を適用する。
     * @param {number} playbackSessionId
     * @returns {null}
     */
    function handleYoutubePlayerAttachFailure(playbackSessionId) {
        // API読み込み失敗時は埋め込みのみで継続する
        debugPlayback("youtube", "attachPlayer failed to create player", {
            playbackSessionId
        });
        const thumbDiv = getSharedPlaybackThumb(playbackSessionId);
        if (getPlaybackMode(thumbDiv) === "autoplay") {
            const error = /** @type {YoutubePlaybackError} */ (new Error("iframe api unavailable for autoplay"));
            error.code = "iframe-api-load-failed";
            throw error;
        }
        playbackStartAttempts.settle(
            playbackSessionId,
            buildPlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.STARTED)
        );
        return null;
    }

    /**
     * Player 接続前に始まった再生状態を取りこぼさないよう、現在状態を反映する。
     * @param {YoutubePlayerLike | null | undefined} player
     * @param {number} playbackSessionId
     */
    function syncAttachedPlayerState(player, playbackSessionId) {
        if (!player || typeof player.getPlayerState !== "function") return;
        try {
            const currentState = player.getPlayerState();
            if (currentState === window.YT.PlayerState.PLAYING) {
                youtubeApi.handleStateChange({
                    data: currentState,
                    target: player
                }, playbackSessionId);
            }
        } catch {
            debugPlayback("youtube", "failed to read attached player state", {
                playbackSessionId
            });
        }
    }

    /**
     * 共有プレイヤーを停止できたか返す。
     * @returns {boolean}
     */
    function stopSharedPlaybackPlayer() {
        const player = getSharedPlaybackState().player;
        if (!player || typeof player.stopVideo !== "function") return false;
        try {
            player.stopVideo();
            debugPlayback("youtube", "stopPlayer called");
            return true;
        } catch {
            debugPlayback("youtube", "stopPlayer failed");
            return false;
        }
    }

    /**
     * 現在の再生設定で埋め込みプレイヤーを自動開始するか返す。
     * @returns {boolean}
     */
    function isEmbeddedPlayerAutoplayEnabled() {
        return Boolean(playbackUi.continuousPlayback || playbackUi.loopPlayback);
    }

    /**
     * 共有再生に使う iframe 要素を生成する。
     * @returns {HTMLIFrameElement | null}
     */
    function createSharedPlaybackFrame() {
        if (!canUseDom()) return null;
        const iframe = document.createElement("iframe");
        applyYoutubePlayerIframeAttributes(iframe);
        return iframe;
    }

    /**
     * 共有再生に使う閉じるボタンを生成する。
     * @returns {HTMLButtonElement | null}
     */
    function createSharedPlaybackCloseButton() {
        if (!canUseDom()) return null;
        const close = document.createElement("button");
        close.type = "button";
        close.className = "thumb-close-btn";
        close.setAttribute("aria-label", "サムネイルに戻す");
        close.innerHTML = "&times;";
        close.addEventListener("click", (event) => {
            event.stopPropagation();
            const activeThumb = playbackUi.activeThumb;
            if (!activeThumb) return;
            restoreThumbnail(activeThumb, activeThumb.dataset.videoId || "");
        });
        return close;
    }

    /**
     * autoplay 開始失敗のデバッグ用詳細を組み立てる。
     * @param {Element | null | undefined} thumbDiv
     * @param {PlaybackStartFailureOptions | undefined} options
     * @returns {{ songKey: string, videoId: string, reason: string, errorCode?: unknown }}
     */
    function buildAutoplayFailureDebugDetails(thumbDiv, options) {
        const details = {
            songKey: getSongKeyFromYoutubeThumb(thumbDiv),
            videoId: isHtmlElement(thumbDiv) ? (thumbDiv.dataset.videoId || "") : "",
            reason: options && options.reason ? options.reason : "unknown"
        };
        if (options && options.errorCode !== undefined) {
            details.errorCode = options.errorCode;
        }
        return details;
    }

    /**
     * autoplay 開始失敗を opt-in デバッグログへ出力する。
     * @param {Element | null | undefined} thumbDiv
     * @param {PlaybackStartFailureOptions | undefined} options
     */
    function logAutoplayPlaybackFailure(thumbDiv, options) {
        debugPlayback(
            "youtube",
            "autoplay playback start failed; skipping candidate",
            buildAutoplayFailureDebugDetails(thumbDiv, options)
        );
    }

    /**
     * 再生開始失敗フックへ渡す payload を組み立てる。
     * @param {string} songKey
     * @param {YoutubePlaybackMode} playbackMode
     * @param {{ wasPlaybackStartUnconfirmed?: boolean } | undefined} [options]
     * @returns {PlaybackStartFailedPayload}
     */
    function buildPlaybackStartFailedPayload(songKey, playbackMode, options = undefined) {
        const payload = {
            songKey,
            playbackMode
        };
        if (options && options.wasPlaybackStartUnconfirmed) {
            payload.wasPlaybackStartUnconfirmed = true;
        }
        return payload;
    }

    /**
     * 再生開始失敗時の後始末を行い、通常サムネイル表示へ戻す。
     * @param {HTMLElement} thumbDiv
     * @param {PlaybackStartFailureOptions | undefined} [options]
     */
    function handlePlaybackStartFailure(thumbDiv, options = undefined) {
        const playbackMode = options && options.playbackMode ? options.playbackMode : getPlaybackMode(thumbDiv);
        const failedSongKey = getSongKeyFromYoutubeThumb(thumbDiv);
        const failedSessionId = Number.isFinite(options && options.sessionId) ? options.sessionId : 0;
        const shouldNotifyStartFailure =
            Boolean(failedSongKey) &&
            (!failedSessionId || isCurrentPlaybackSession(thumbDiv, failedSessionId));
        if (playbackMode === "autoplay") {
            logAutoplayPlaybackFailure(thumbDiv, options);
        }
        const expectedGeneration = playbackState.transitionGeneration + 1;
        Promise.resolve(restoreThumbnail(thumbDiv, thumbDiv.dataset.videoId || "")).then((restored) => {
            if (!restored) return;
            if (expectedGeneration !== playbackState.transitionGeneration) return;
            if (!shouldNotifyStartFailure) return;
            debugPlayback("youtube", "playback start failed hook", {
                songKey: failedSongKey,
                playbackMode,
                reason: options && options.reason ? options.reason : "unknown",
                errorCode: options && options.errorCode
            });
            handlePlaybackStartFailed(buildPlaybackStartFailedPayload(failedSongKey, playbackMode, options));
        });
    }

    /**
     * 共有 iframe と閉じるボタンを必要に応じて生成する。
     * @returns {YoutubeSharedPlaybackState}
     */
    function ensureSharedPlaybackElements() {
        return ensureYoutubeSharedPlaybackElements({
            youtube,
            syncIframe: () => syncSharedPlaybackIframe(),
            createFrame: () => createSharedPlaybackFrame(),
            createCloseButton: () => createSharedPlaybackCloseButton()
        });
    }

    /**
     * 共有プレーヤー実体を破棄し、再生成できる初期状態へ戻す。
     */
    function destroySharedPlayback() {
        destroyYoutubeSharedPlayback({
            youtube,
            syncIframe: () => syncSharedPlaybackIframe(),
                debug: (message, details) => debugPlayback("youtube", message, details)
        });
    }

    /**
     * 指定サムネイルに共有プレーヤーが載っているか判定する。
     * @param {Element | null | undefined} thumbDiv
     * @returns {boolean}
     */
    function isSharedPlaybackMountedInThumb(thumbDiv) {
        const iframe = syncSharedPlaybackIframe();
        return Boolean(
            isHtmlElement(thumbDiv) &&
            isHtmlElement(iframe) &&
            iframe.parentElement === thumbDiv
        );
    }

    /**
     * 指定サムネイルから共有プレーヤーを外して破棄する。
     * @param {Element | null | undefined} thumbDiv
     * @param {{ stopPlayback?: boolean } | undefined} [options]
     * @returns {boolean}
     */
    function detachSharedPlayback(thumbDiv, options = undefined) {
        if (!isSharedPlaybackMountedInThumb(thumbDiv)) {
            const sharedPlayback = getSharedPlaybackState();
            if (sharedPlayback.hostThumb === thumbDiv) {
                sharedPlayback.hostThumb = null;
                setSharedPlaybackSessionId(0);
            }
            debugPlayback("youtube", "detachSharedPlayback skipped because iframe is not mounted in thumb", {
                songKey: getSongKeyFromYoutubeThumb(thumbDiv)
            });
            return false;
        }
        const iframe = syncSharedPlaybackIframe();
        const shouldStopPlayback = !(options && options.stopPlayback === false);
        tracePlayback("youtube", "detachSharedPlayback", {
            songKey: getSongKeyFromYoutubeThumb(thumbDiv),
            shouldStopPlayback
        });
        const stopped = shouldStopPlayback ? stopSharedPlaybackPlayer() : false;
        if (shouldStopPlayback && !stopped && isHtmlElement(iframe)) {
            iframe.src = "about:blank";
            debugPlayback("youtube", "detachSharedPlayback fell back to about:blank", {
                songKey: getSongKeyFromYoutubeThumb(thumbDiv)
            });
        }
        destroySharedPlayback();
        clearActiveThumb(thumbDiv);
        return true;
    }

    /**
     * 指定サムネイルへ共有プレーヤーを差し込み、iframe src から再生開始する。
     * @param {HTMLElement} thumbDiv
     * @param {YoutubeTarget} yt
     * @param {number} playbackSessionId
     * @returns {Promise<boolean>}
     */
    function mountSharedPlayback(thumbDiv, yt, playbackSessionId) {
        let sharedPlayback = getSharedPlaybackState();
        if (sharedPlayback.player || sharedPlayback.iframe || sharedPlayback.hostThumb) {
            debugPlayback("youtube", "mountSharedPlayback recreating iframe-backed player", {
                previousSongKey: getSongKeyFromYoutubeThumb(sharedPlayback.hostThumb),
                nextSongKey: getSongKeyFromYoutubeThumb(thumbDiv),
                videoId: yt && yt.videoId,
                playbackSessionId
            });
            destroySharedPlayback();
        }
        sharedPlayback = ensureSharedPlaybackElements();
        const iframe = syncSharedPlaybackIframe() || sharedPlayback.iframe;
        if (!isHtmlElement(iframe)) {
            return Promise.resolve(false);
        }
        iframe.src = youtubeApi.buildEmbedUrl(yt);
        thumbDiv.replaceChildren(iframe, sharedPlayback.closeButton);
        sharedPlayback.hostThumb = thumbDiv;
        setSharedPlaybackSessionId(playbackSessionId);
        debugPlayback("youtube", "mountSharedPlayback using iframe src", {
            songKey: getSongKeyFromYoutubeThumb(thumbDiv),
            videoId: yt && yt.videoId,
            playbackSessionId,
            iframeSrc: iframe.src
        });
        return youtubePlayerAdapter.attach(iframe, playbackSessionId)
            .then((player) => {
                syncAttachedPlayerState(player, playbackSessionId);
                return Boolean(thumbDiv.querySelector("iframe"));
            });
    }

    /**
     * サムネイル表示時にYouTube APIの事前読み込みを行う。
     */
    function ensureYoutubeApiForThumbnails() {
        if (!playbackUi.showThumbnails) return;
        requestAnimationFrame(() => youtubeApi.ensureReady().catch(() => {}));
    }

    /**
     * サムネイルに紐づく再生セッションIDを返す。
     * @param {Element | null | undefined} thumbDiv
     * @returns {number}
     */
    function getPlaybackSessionId(thumbDiv) {
        const value = isHtmlElement(thumbDiv) ? thumbDiv.dataset.playbackSessionId : "";
        const sessionId = Number.parseInt(String(value || ""), 10);
        return Number.isFinite(sessionId) ? sessionId : 0;
    }

    /**
     * サムネイルに再生セッションIDを設定または解除する。
     * @param {Element | null | undefined} thumbDiv
     * @param {number} sessionId
     */
    function setPlaybackSessionId(thumbDiv, sessionId) {
        if (!isHtmlElement(thumbDiv)) return;
        if (Number.isFinite(sessionId) && sessionId > 0) {
            thumbDiv.dataset.playbackSessionId = String(sessionId);
            return;
        }
        delete thumbDiv.dataset.playbackSessionId;
    }

    /**
     * イベントが現在有効な再生セッションに属するか判定する。
     * @param {Element | null | undefined} thumbDiv
     * @param {number} sessionId
     * @returns {boolean}
     */
    function isCurrentPlaybackSession(thumbDiv, sessionId) {
        return isYoutubePlaybackSessionActive(playbackState, sessionId) &&
            getPlaybackSessionId(thumbDiv) === sessionId;
    }

    /**
     * 実際に再生へ使う終了秒数を返す。
     * @param {YoutubeTarget | null | undefined} yt
     * @returns {number | null}
     */
    function getEffectiveEndSeconds(yt) {
        if (playbackUi.playArchiveToEnd) return null;
        return Number.isFinite(yt && yt.endSeconds) ? yt.endSeconds : null;
    }

    /**
     * サムネイルコンテナを再生状態から初期表示へリセットする。
     * @param {HTMLElement} thumbDiv
     * @param {string} videoId
     * @param {string} playbackKey
     */
    function resetThumbnailContainer(thumbDiv, videoId, playbackKey) {
        const previousSessionId = getPlaybackSessionId(thumbDiv);
        playbackStartAttempts.cancelForThumb(thumbDiv);
        applyPlaybackStateEvent({
            type: "CLEAR_PLAYBACK",
            sessionId: previousSessionId
        });
        clearActiveThumb(thumbDiv);
        detachSharedPlayback(thumbDiv);
        thumbDiv.dataset.videoId = videoId;
        thumbDiv.dataset.playbackKey = playbackKey;
        setPlaybackSessionId(thumbDiv, 0);
        setPlaybackMode(thumbDiv);
        thumbDiv.classList.remove("playing");
        setYoutubeThumbnailExpandedCardState(thumbDiv, false);
        thumbDiv.onclick = null;
        thumbDiv.replaceChildren();
    }

    /**
     * 再生対象の同一性判定に使うキーを生成する。
     * @param {YoutubeTarget} yt
     * @returns {string}
     */
    function buildPlaybackKey(yt) {
        if (!yt.videoId) return "";
        const endSeconds = getEffectiveEndSeconds(yt);
        const endPart = Number.isFinite(endSeconds) ? String(endSeconds) : "";
        return `${yt.videoId}:${yt.startSeconds}:${endPart}`;
    }

    /**
     * 現在表示中の再生対象と次の対象が同一か判定する。
     * @param {HTMLElement} thumbDiv
     * @param {string} nextPlaybackKey
     * @returns {boolean}
     */
    function isSamePlaybackTarget(thumbDiv, nextPlaybackKey) {
        if (!playbackUi.showThumbnails) return false;
        if (!isSharedPlaybackMountedInThumb(thumbDiv)) return false;
        return (thumbDiv.dataset.playbackKey || "") === nextPlaybackKey;
    }

    /**
     * アクティブなサムネイルを切り替える。
     * @param {HTMLElement} thumbDiv
     * @param {{ preserveTransitionGeneration?: boolean } | undefined} [options]
     */
    function setActiveThumb(thumbDiv, options) {
        if (playbackUi.activeThumb && playbackUi.activeThumb !== thumbDiv) {
            restoreThumbnail(playbackUi.activeThumb, playbackUi.activeThumb.dataset.videoId || "", {
                preserveTransitionGeneration: Boolean(options && options.preserveTransitionGeneration)
            });
        }
        playbackUi.activeThumb = thumbDiv;
    }

    /**
     * 指定サムネイルがアクティブなら参照を解除する。
     * @param {Element | null | undefined} thumbDiv
     */
    function clearActiveThumb(thumbDiv) {
        if (playbackUi.activeThumb === thumbDiv) playbackUi.activeThumb = null;
    }

    /**
     * スクロール監視結果に応じて画像読み込みや再生停止を処理する。
     * @param {IntersectionObserverEntry[]} entries
     */
    function handleScrollObserver(entries) {
        entries.forEach((entry) => {
            const thumb = entry.target;
            if (!isHtmlElement(thumb)) return;
            if (entry.isIntersecting) {
                const img = thumb.querySelector("img");
                const srcAttr = img ? img.getAttribute("src") : null;
                if (img && (!srcAttr || srcAttr === "about:blank")) {
                    const dataSrc = img.dataset.src;
                    if (dataSrc) img.src = dataSrc;
                }
                return;
            }
            if (!entry.isIntersecting) {
                if (!STOP_PLAYBACK_ON_SCROLL_OUT) return;
                playbackStartAttempts.cancelForThumb(thumb);
                if (!detachSharedPlayback(thumb)) return;
                const videoId = thumb.dataset.videoId;
                setPlaybackSessionId(thumb, 0);
                thumb.classList.remove("playing");
                setYoutubeThumbnailOrientation(thumb, "landscape");
                setYoutubeThumbnailExpandedCardState(thumb, false);
                if (videoId) {
                    applyYoutubeThumbnailImage(thumb, videoId);
                } else {
                    thumb.replaceChildren();
                }
                refreshCardLayoutSoon(thumb);
            }
        });
    }

    /**
     * サムネイル可視判定用のIntersectionObserverを再設定する。
     */
    function setupScrollObserver() {
        const headerHeight = getHeaderHeight();
        if (playbackUi.scrollObserver) playbackUi.scrollObserver.disconnect();
        playbackUi.scrollObserver = new IntersectionObserver(handleScrollObserver, {
            threshold: 0,
            rootMargin: `-${headerHeight}px 0px 0px 0px`
        });
        if (!playbackUi.showThumbnails) return;
        document.querySelectorAll(".thumb").forEach((thumb) => {
            playbackUi.scrollObserver.observe(thumb);
        });
    }

    /**
     * 埋め込み再生を解除して通常サムネイル表示へ戻す。
     * @param {HTMLElement} thumbDiv
     * @param {string} videoId
     * @param {{ preserveTransitionGeneration?: boolean } | undefined} options
     * @returns {Promise<unknown>}
     */
    function restoreThumbnail(thumbDiv, videoId, options = undefined) {
        tracePlayback("youtube", "restoreThumbnail", {
            songKey: getSongKeyFromYoutubeThumb(thumbDiv),
            videoId,
            playbackMode: getPlaybackMode(thumbDiv),
            sessionId: getPlaybackSessionId(thumbDiv)
        });
        applyPlaybackStateEvent({
            type: "RESTORE_PLAYBACK",
            sessionId: getPlaybackSessionId(thumbDiv),
            preserveTransitionGeneration: Boolean(options && options.preserveTransitionGeneration)
        });
        playbackStartAttempts.cancelForThumb(thumbDiv);
        clearActiveThumb(thumbDiv);
        detachSharedPlayback(thumbDiv);
        thumbDiv.dataset.videoId = videoId;
        thumbDiv.dataset.playbackKey = "";
        setPlaybackSessionId(thumbDiv, 0);
        setPlaybackMode(thumbDiv);
        setYoutubeThumbnailOrientation(thumbDiv, "landscape");
        setYoutubeThumbnailPlaybackState(thumbDiv, "stopped");
        setYoutubeThumbnailExpandedCardState(thumbDiv, false);
        if (videoId) {
            applyYoutubeThumbnailImage(thumbDiv, videoId, { eager: true });
        } else {
            thumbDiv.replaceChildren();
        }
        return refreshCardLayoutSoon(thumbDiv);
    }

    /**
     * 現在アクティブな再生サムネイルを通常表示へ復元する。
     */
    function restoreActivePlayback() {
        const activeThumb = playbackUi.activeThumb;
        if (!activeThumb) return;
        if (!activeThumb.isConnected) {
            playbackUi.activeThumb = null;
            applyPlaybackStateEvent({ type: "CLEAR_PLAYBACK" });
            return;
        }
        tracePlayback("youtube", "restoreActivePlayback", {
            songKey: getSongKeyFromYoutubeThumb(activeThumb),
            videoId: activeThumb.dataset.videoId || "",
            playbackMode: getPlaybackMode(activeThumb),
            sessionId: getPlaybackSessionId(activeThumb)
        });
        restoreThumbnail(activeThumb, activeThumb.dataset.videoId || "");
    }

    /**
     * サムネイルを埋め込みプレイヤーへ切り替えて再生開始する。
     * @param {HTMLElement} thumbDiv
     * @param {YoutubeTarget} yt
     * @param {YoutubePlaybackOptions | undefined} options
     * @returns {Promise<{status: string}>}
     */
    function startEmbeddedPlayback(thumbDiv, yt, options) {
        const playbackMode = options && options.playbackMode ? options.playbackMode : "manual";
        const playbackSessionId = applyPlaybackStateEvent({
            type: "REQUEST_PLAYBACK"
        }).activeSessionId;
        const playbackStartPromise = playbackStartAttempts.create(playbackSessionId, {
            thumbDiv,
            playbackMode
        });
        setActiveThumb(thumbDiv, { preserveTransitionGeneration: true });
        thumbDiv.dataset.videoId = yt.videoId;
        thumbDiv.dataset.playbackKey = buildPlaybackKey(yt);
        setPlaybackSessionId(thumbDiv, playbackSessionId);
        setPlaybackMode(thumbDiv, playbackMode);
        setYoutubeThumbnailOrientation(thumbDiv, yt && yt.isVertical ? "vertical" : "landscape");
        setYoutubeThumbnailPlaybackState(thumbDiv, "playing");
        setYoutubeThumbnailExpandedCardState(thumbDiv, Boolean(yt && yt.isVertical));
        Promise.resolve(mountSharedPlayback(thumbDiv, yt, playbackSessionId)).then((didMount) => {
            if (didMount) {
                playbackStartAttempts.armStartTimeout(playbackSessionId);
                return;
            }
            playbackStartAttempts.settle(
                playbackSessionId,
                buildPlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED)
            );
            handlePlaybackStartFailure(thumbDiv, {
                sessionId: playbackSessionId,
                playbackMode,
                reason: "mount-failed"
            });
        }).catch((error) => {
            playbackStartAttempts.settle(
                playbackSessionId,
                buildPlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED)
            );
            handlePlaybackStartFailure(thumbDiv, {
                sessionId: playbackSessionId,
                playbackMode,
                reason: error && typeof error.code === "string"
                    ? error.code
                    : "mount-error"
            });
        });
        if (yt && yt.isVertical) {
            refreshCardLayoutSoon(thumbDiv);
        }
        if (options && options.revealCard) {
            revealYoutubePlaybackCardIfNeeded(thumbDiv);
        }
        return playbackStartPromise;
    }

    /**
     * 指定サムネイルを即座に埋め込み再生へ切り替える。
     * @param {Element | null | undefined} thumbDiv
     * @param {YoutubeTarget | null | undefined} yt
     * @param {YoutubePlaybackOptions | undefined} options
     * @returns {Promise<{status: string}>}
     */
    function playThumbnail(thumbDiv, yt, options) {
        const failedResult = createYoutubePlaybackStartResult(YOUTUBE_PLAYBACK_START_STATUS.FAILED);
        if (!isHtmlElement(thumbDiv)) return Promise.resolve(failedResult);
        if (!playbackUi.showThumbnails) return Promise.resolve(failedResult);
        if (!yt || !yt.videoId) return Promise.resolve(failedResult);
        return startEmbeddedPlayback(thumbDiv, yt, options);
    }

    /**
     * 曲情報に合わせてサムネイル表示内容を更新する。
     * @param {HTMLElement} thumbDiv
     * @param {YoutubeTarget} yt
     */
    function updateThumbnail(thumbDiv, yt) {
        const nextPlaybackKey = buildPlaybackKey(yt);
        if (isSamePlaybackTarget(thumbDiv, nextPlaybackKey)) {
            thumbDiv.dataset.videoId = yt.videoId;
            setYoutubeThumbnailOrientation(thumbDiv, yt && yt.isVertical ? "vertical" : "landscape");
            return;
        }
        resetThumbnailContainer(thumbDiv, yt.videoId, nextPlaybackKey);
        setYoutubeThumbnailOrientation(thumbDiv, "landscape");

        if (!playbackUi.showThumbnails) return;
        if (!yt.videoId) return;

        const img = createYoutubeThumbnailImage(yt.videoId);
        thumbDiv.onclick = () => {
            if (thumbDiv.classList.contains("playing")) return;
            startEmbeddedPlayback(thumbDiv, yt, {
                revealCard: true,
                playbackMode: "manual"
            });
        };
        thumbDiv.appendChild(img);
        if (shouldLoadYoutubeThumbnailNow(thumbDiv)) {
            img.src = img.dataset.src;
        }
    }

    return {
        setLayoutHook,
        setPlaybackEndedHook,
        setPlaybackStartFailedHook,
        isIOSWebKit,
        ensureThumbnailPlaybackReady: ensureYoutubeApiForThumbnails,
        setupScrollObserver,
        playThumbnail,
        updateThumbnail,
        restoreActivePlayback
    };
}
