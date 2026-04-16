import { createLayoutRefreshScheduler } from "../lib/layout-anchor.mjs?v=11";
import { getPlaybackUiState } from "../lib/ui-slices.mjs?v=11";
import {
    applyYoutubePlayerIframeAttributes,
    buildYoutubeEmbedUrl,
    createYoutubeIframeApiLoader,
    YT_EMBED_HOST
} from "../lib/youtube-embed.mjs?v=11";
import {
    destroyYoutubeSharedPlayback,
    ensureYoutubeSharedPlaybackElements,
    ensureYoutubeSharedPlaybackParkingNode,
    getYoutubeSharedPlaybackState,
    getYoutubeSharedPlaybackThumb,
    setPendingYoutubeSharedPlaybackAttach,
    setYoutubeSharedPlaybackSessionId,
    syncYoutubeSharedPlaybackIframe
} from "../lib/youtube-shared-playback.mjs?v=11";
import {
    applyYoutubeThumbnailImage,
    createYoutubeThumbnailImage,
    getSongKeyFromYoutubeThumb,
    revealYoutubePlaybackCardIfNeeded,
    setYoutubeThumbnailExpandedCardState,
    setYoutubeThumbnailOrientation,
    setYoutubeThumbnailPlaybackState,
    shouldLoadYoutubeThumbnailNow
} from "../lib/youtube-thumbnail.mjs?v=11";

export { extractYoutubeInfo } from "../lib/youtube-url.mjs?v=11";

/**
 * 現在の実行環境で HTMLElement 判定が可能な場合だけ要素型チェックする。
 * @param {*} value
 * @returns {boolean}
 */
function isHtmlElement(value) {
    return typeof HTMLElement === "function" && value instanceof HTMLElement;
}

/**
 * 要素生成に必要な document API が利用可能か判定する。
 * @returns {boolean}
 */
function canUseDom() {
    return typeof document === "object" && !!document && typeof document.createElement === "function";
}

/**
 * サムネイル表示と埋め込み再生の制御を行うコントローラーを作成する。
 * @param {*} youtube
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
    let handlePlaybackEnded = () => {};
    let playbackSessionSequence = 0;
    let playbackTransitionGeneration = 0;
    const refreshCardLayoutSoon = createLayoutRefreshScheduler(() => refreshLayout);
    const PLAYBACK_START_TIMEOUT_MS = 4000;
    const youtubeIframeApiLoader = createYoutubeIframeApiLoader({
        youtube,
        iframeApiSrc: YT_IFRAME_API_SRC,
        iframeApiSelector: YT_IFRAME_API_SELECTOR,
        readyPollMs: YT_IFRAME_READY_POLL_MS
    });

    /**
     * 共有埋め込みプレーヤーの保持領域を返す。
     * @returns {*}
     */
    function getSharedPlaybackState() {
        return getYoutubeSharedPlaybackState(youtube);
    }

    /**
     * 共有プレーヤーが内部で置き換えた最新の iframe 要素を同期する。
     * @returns {*}
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
     * @param {*} iframe
     * @param {number} playbackSessionId
     */
    function setPendingSharedPlaybackAttach(iframe, playbackSessionId) {
        setPendingYoutubeSharedPlaybackAttach(youtube, iframe, playbackSessionId);
    }

    /**
     * 指定セッションの現在の再生サムネイルを返す。
     * @param {number} sessionId
     * @returns {*}
     */
    function getSharedPlaybackThumb(sessionId) {
        return getYoutubeSharedPlaybackThumb(youtube, sessionId);
    }

    /**
     * YouTube 再利用デバッグログの有効状態を返す。
     * @returns {boolean}
     */
    function isYoutubeDebugEnabled() {
        try {
            if (window.__KNK_DEBUG_YOUTUBE__ === true) return true;
            return localStorage.getItem("debugYoutubePlayer") === "true";
        } catch {
            return false;
        }
    }

    /**
     * YouTube 再利用まわりのデバッグログを出力する。
     * @param {string} message
     * @param {*} details
     */
    function debugYoutube(message, details) {
        if (!isYoutubeDebugEnabled()) return;
        if (details === undefined) {
            console.debug("[youtube]", message);
            return;
        }
        console.debug("[youtube]", message, details);
    }

    /**
     * state change event が示す状態と、プレーヤーが現在返す状態の不一致を検出する。
     * 古い再生から遅れて届いたイベントを誤処理しないために使う。
     * @param {*} event
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

    /**
     * 指定セッションの再生開始待ちを完了扱いにする。
     * @param {number | undefined} sessionId
     * @param {boolean} didStart
     * @returns {boolean}
     */
    function settlePlaybackStartAttempt(sessionId, didStart) {
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
     * @returns {Promise<boolean>}
     */
    function createPlaybackStartAttempt(sessionId) {
        settlePlaybackStartAttempt(undefined, false);
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                const didSettle = settlePlaybackStartAttempt(sessionId, false);
                if (!didSettle) return;
                const thumbDiv = getSharedPlaybackThumb(sessionId);
                if (!isHtmlElement(thumbDiv)) return;
                if (!isCurrentPlaybackSession(thumbDiv, sessionId)) return;
                restoreThumbnail(thumbDiv, thumbDiv.dataset.videoId || "");
            }, PLAYBACK_START_TIMEOUT_MS);
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
    function cancelPlaybackStartAttemptForThumb(thumbDiv) {
        return settlePlaybackStartAttempt(getPlaybackSessionId(thumbDiv), false);
    }

    /**
     * レイアウト再計算フックを登録する。
     * @param {*} fn
     */
    function setLayoutHook(fn) {
        if (typeof fn === "function") {
            refreshLayout = fn;
        }
    }

    /**
     * 再生終了時の継続再生フックを登録する。
     * @param {*} fn
     */
    function setPlaybackEndedHook(fn) {
        if (typeof fn === "function") {
            handlePlaybackEnded = fn;
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
         * @param {*} yt
         * @returns {string}
         */
        buildEmbedUrl(yt) {
            return buildYoutubeEmbedUrl(yt, {
                endSeconds: getEffectiveEndSeconds(yt)
            });
        },
        /**
         * YouTube が生成した iframe へ必要な属性を反映する。
         * @param {*} iframe
         */
        applyPlayerIframeAttributes(iframe) {
            applyYoutubePlayerIframeAttributes(iframe);
        },
        /**
         * プレイヤー状態変化に応じて再生状態表示を更新する。
         * @param {*} event
         * @param {number} playbackSessionId
         */
        handleStateChange(event, playbackSessionId) {
            const thumbDiv = getSharedPlaybackThumb(playbackSessionId);
            debugYoutube("player state change", {
                playbackSessionId,
                playerState: event && event.data,
                hasThumb: isHtmlElement(thumbDiv),
                activeSongKey: isHtmlElement(thumbDiv) ? getSongKeyFromYoutubeThumb(thumbDiv) : ""
            });
            if (!isHtmlElement(thumbDiv)) return;
            if (!isCurrentPlaybackSession(thumbDiv, playbackSessionId)) return;
            if (event.data !== window.YT.PlayerState.PLAYING && isStalePlayerStateEvent(event)) {
                debugYoutube("ignored stale player state event", {
                    playbackSessionId,
                    playerState: event && event.data,
                    activeSongKey: getSongKeyFromYoutubeThumb(thumbDiv)
                });
                return;
            }
            if (event.data === window.YT.PlayerState.ENDED) {
                settlePlaybackStartAttempt(playbackSessionId, false);
                const endedSongKey = getSongKeyFromYoutubeThumb(thumbDiv);
                const endedGeneration = advancePlaybackTransitionGeneration();
                Promise.resolve(restoreThumbnail(thumbDiv, thumbDiv.dataset.videoId || "", {
                    preserveTransitionGeneration: true
                })).then((restored) => {
                    if (!restored) return;
                    if (endedGeneration !== playbackTransitionGeneration) return;
                    if (endedSongKey) {
                        handlePlaybackEnded({ songKey: endedSongKey });
                    }
                });
                return;
            }
            if (event.data === window.YT.PlayerState.PAUSED) {
                setYoutubeThumbnailPlaybackState(thumbDiv, "stopped");
                return;
            }
            if (event.data === window.YT.PlayerState.PLAYING) {
                settlePlaybackStartAttempt(playbackSessionId, true);
                setYoutubeThumbnailPlaybackState(thumbDiv, "playing");
            }
        },
        /**
         * プレーヤーエラー発生時に再生開始待ちを失敗として処理する。
         * @param {*} event
         * @param {number} playbackSessionId
         */
        handlePlayerError(event, playbackSessionId) {
            const thumbDiv = getSharedPlaybackThumb(playbackSessionId);
            if (!isHtmlElement(thumbDiv)) return;
            if (!isCurrentPlaybackSession(thumbDiv, playbackSessionId)) return;
            settlePlaybackStartAttempt(playbackSessionId, false);
            restoreThumbnail(thumbDiv, thumbDiv.dataset.videoId || "");
        },
        /**
         * 生成済み iframe へ YouTube プレイヤーを紐付ける。
         * @param {*} iframe
         * @param {number} playbackSessionId
         */
        attachPlayer(iframe, playbackSessionId) {
            const sharedPlayback = getSharedPlaybackState();
            setPendingSharedPlaybackAttach(iframe, playbackSessionId);
            if (sharedPlayback.playerPromise) {
                setSharedPlaybackSessionId(playbackSessionId);
                debugYoutube("attachPlayer waiting for existing playerPromise", {
                    playbackSessionId
                });
                return sharedPlayback.playerPromise;
            }
            setSharedPlaybackSessionId(playbackSessionId);
            debugYoutube("attachPlayer creating player", {
                playbackSessionId
            });
            sharedPlayback.playerPromise = this.ensureReady().then(() => {
                const latestSharedPlayback = getSharedPlaybackState();
                const pendingAttach = latestSharedPlayback.pendingAttach;
                if (!pendingAttach) return null;
                const nextIframe = pendingAttach.iframe;
                const nextPlaybackSessionId = pendingAttach.playbackSessionId;
                setSharedPlaybackSessionId(nextPlaybackSessionId);
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
                            this.applyPlayerIframeAttributes(
                                event && event.target && typeof event.target.getIframe === "function"
                                    ? event.target.getIframe()
                                    : nextIframe
                            );
                        },
                        onStateChange: (event) => this.handleStateChange(
                            event,
                            nextPlaybackSessionId
                        ),
                        onError: (event) => this.handlePlayerError(
                            event,
                            nextPlaybackSessionId
                        )
                    }
                });
                this.applyPlayerIframeAttributes(nextIframe);
                syncSharedPlaybackIframe();
                debugYoutube("attachPlayer created player", {
                    playbackSessionId: nextPlaybackSessionId
                });
                return latestSharedPlayback.player;
            }).catch(() => {
                // API読み込み失敗時は埋め込みのみで継続する
                debugYoutube("attachPlayer failed to create player", {
                    playbackSessionId
                });
                settlePlaybackStartAttempt(playbackSessionId, true);
                return null;
            }).finally(() => {
                sharedPlayback.playerPromise = null;
            });
            return sharedPlayback.playerPromise;
        }
    };

    /**
     * 共有プレイヤーを停止できたか返す。
     * @returns {boolean}
     */
    function stopSharedPlaybackPlayer() {
        const player = getSharedPlaybackState().player;
        if (!player || typeof player.stopVideo !== "function") return false;
        try {
            player.stopVideo();
            debugYoutube("stopPlayer called");
            return true;
        } catch {
            debugYoutube("stopPlayer failed");
            return false;
        }
    }

    /**
     * 共有再生に使う iframe 要素を生成する。
     * @returns {*}
     */
    function createSharedPlaybackFrame() {
        if (!canUseDom()) return null;
        const iframe = document.createElement("iframe");
        youtubeApi.applyPlayerIframeAttributes(iframe);
        return iframe;
    }

    /**
     * 共有再生に使う閉じるボタンを生成する。
     * @returns {*}
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
     * 共有 iframe と閉じるボタンを必要に応じて生成する。
     * @returns {*}
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
     * 共有プレーヤーの退避先ノードを返す。
     * @returns {*}
     */
    function ensureSharedPlaybackParkingNode() {
        return ensureYoutubeSharedPlaybackParkingNode(youtube);
    }

    /**
     * 共有プレーヤー実体を破棄し、再生成できる初期状態へ戻す。
     */
    function destroySharedPlayback() {
        destroyYoutubeSharedPlayback({
            youtube,
            syncIframe: () => syncSharedPlaybackIframe(),
            debug: (message, details) => debugYoutube(message, details)
        });
    }

    /**
     * 指定サムネイルに共有プレーヤーが載っているか判定する。
     * @param {*} thumbDiv
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
     * @param {*} thumbDiv
     * @returns {boolean}
     */
    function detachSharedPlayback(thumbDiv, options) {
        if (!isSharedPlaybackMountedInThumb(thumbDiv)) {
            const sharedPlayback = getSharedPlaybackState();
            if (sharedPlayback.hostThumb === thumbDiv) {
                sharedPlayback.hostThumb = null;
                setSharedPlaybackSessionId(0);
            }
            debugYoutube("detachSharedPlayback skipped because iframe is not mounted in thumb", {
                songKey: getSongKeyFromYoutubeThumb(thumbDiv)
            });
            return false;
        }
        const iframe = syncSharedPlaybackIframe();
        const shouldStopPlayback = !(options && options.stopPlayback === false);
        debugYoutube("detachSharedPlayback", {
            songKey: getSongKeyFromYoutubeThumb(thumbDiv),
            shouldStopPlayback
        });
        const stopped = shouldStopPlayback ? stopSharedPlaybackPlayer() : false;
        if (shouldStopPlayback && !stopped && isHtmlElement(iframe)) {
            iframe.src = "about:blank";
            debugYoutube("detachSharedPlayback fell back to about:blank", {
                songKey: getSongKeyFromYoutubeThumb(thumbDiv)
            });
        }
        destroySharedPlayback();
        clearActiveThumb(thumbDiv);
        return true;
    }

    /**
     * 指定サムネイルへ共有プレーヤーを差し込み、iframe src から再生開始する。
     * @param {*} thumbDiv
     * @param {*} yt
     * @param {number} playbackSessionId
     * @returns {Promise<boolean>}
     */
    function mountSharedPlayback(thumbDiv, yt, playbackSessionId) {
        let sharedPlayback = getSharedPlaybackState();
        if (sharedPlayback.player || sharedPlayback.iframe || sharedPlayback.hostThumb) {
            debugYoutube("mountSharedPlayback recreating iframe-backed player", {
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
        debugYoutube("mountSharedPlayback using iframe src", {
            songKey: getSongKeyFromYoutubeThumb(thumbDiv),
            videoId: yt && yt.videoId,
            playbackSessionId,
            iframeSrc: iframe.src
        });
        return youtubeApi.attachPlayer(iframe, playbackSessionId)
            .then(() => Boolean(thumbDiv.querySelector("iframe")));
    }

    /**
     * サムネイル表示時にYouTube APIの事前読み込みを行う。
     */
    function ensureYoutubeApiForThumbnails() {
        if (!playbackUi.showThumbnails) return;
        requestAnimationFrame(() => youtubeApi.ensureReady().catch(() => {}));
    }

    /**
     * 新しい再生セッションIDを採番する。
     * @returns {number}
     */
    function createPlaybackSessionId() {
        playbackSessionSequence += 1;
        return playbackSessionSequence;
    }

    /**
     * 再生遷移の世代番号を進めて返す。
     * @returns {number}
     */
    function advancePlaybackTransitionGeneration() {
        playbackTransitionGeneration += 1;
        return playbackTransitionGeneration;
    }

    /**
     * サムネイルに紐づく再生セッションIDを返す。
     * @param {*} thumbDiv
     * @returns {number}
     */
    function getPlaybackSessionId(thumbDiv) {
        const value = isHtmlElement(thumbDiv) ? thumbDiv.dataset.playbackSessionId : "";
        const sessionId = Number.parseInt(String(value || ""), 10);
        return Number.isFinite(sessionId) ? sessionId : 0;
    }

    /**
     * サムネイルに再生セッションIDを設定または解除する。
     * @param {*} thumbDiv
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
     * @param {*} thumbDiv
     * @param {number} sessionId
     * @returns {boolean}
     */
    function isCurrentPlaybackSession(thumbDiv, sessionId) {
        return Number.isFinite(sessionId) && sessionId > 0 && getPlaybackSessionId(thumbDiv) === sessionId;
    }

    /**
     * 実際に再生へ使う終了秒数を返す。
     * @param {*} yt
     */
    function getEffectiveEndSeconds(yt) {
        if (!playbackUi.stopAtEndTime) return null;
        return Number.isFinite(yt && yt.endSeconds) ? yt.endSeconds : null;
    }

    /**
     * サムネイルコンテナを再生状態から初期表示へリセットする。
     * @param {*} thumbDiv
     * @param {*} videoId
     * @param {*} playbackKey
     */
    function resetThumbnailContainer(thumbDiv, videoId, playbackKey) {
        cancelPlaybackStartAttemptForThumb(thumbDiv);
        clearActiveThumb(thumbDiv);
        detachSharedPlayback(thumbDiv);
        thumbDiv.dataset.videoId = videoId;
        thumbDiv.dataset.playbackKey = playbackKey;
        setPlaybackSessionId(thumbDiv, 0);
        thumbDiv.classList.remove("playing");
        setYoutubeThumbnailExpandedCardState(thumbDiv, false);
        thumbDiv.onclick = null;
        thumbDiv.replaceChildren();
    }

    /**
     * 再生対象の同一性判定に使うキーを生成する。
     * @param {*} yt
     */
    function buildPlaybackKey(yt) {
        if (!yt.videoId) return "";
        const endSeconds = getEffectiveEndSeconds(yt);
        const endPart = Number.isFinite(endSeconds) ? String(endSeconds) : "";
        return `${yt.videoId}:${yt.startSeconds}:${endPart}`;
    }

    /**
     * 現在表示中の再生対象と次の対象が同一か判定する。
     * @param {*} thumbDiv
     * @param {*} nextPlaybackKey
     */
    function isSamePlaybackTarget(thumbDiv, nextPlaybackKey) {
        if (!playbackUi.showThumbnails) return false;
        if (!isSharedPlaybackMountedInThumb(thumbDiv)) return false;
        return (thumbDiv.dataset.playbackKey || "") === nextPlaybackKey;
    }

    /**
     * アクティブなサムネイルを切り替える。
     * @param {*} thumbDiv
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
     * @param {*} thumbDiv
     */
    function clearActiveThumb(thumbDiv) {
        if (playbackUi.activeThumb === thumbDiv) playbackUi.activeThumb = null;
    }

    /**
     * スクロール監視結果に応じて画像読み込みや再生停止を処理する。
     * @param {*} entries
     */
    function handleScrollObserver(entries) {
        entries.forEach((entry) => {
            const thumb = entry.target;
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
                cancelPlaybackStartAttemptForThumb(thumb);
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
        const header = document.querySelector(".header");
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
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
     * @param {*} thumbDiv
     * @param {*} videoId
     */
    function restoreThumbnail(thumbDiv, videoId, options) {
        if (!(options && options.preserveTransitionGeneration)) {
            advancePlaybackTransitionGeneration();
        }
        cancelPlaybackStartAttemptForThumb(thumbDiv);
        clearActiveThumb(thumbDiv);
        detachSharedPlayback(thumbDiv);
        thumbDiv.dataset.videoId = videoId;
        thumbDiv.dataset.playbackKey = "";
        setPlaybackSessionId(thumbDiv, 0);
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
            return;
        }
        restoreThumbnail(activeThumb, activeThumb.dataset.videoId || "");
    }

    /**
     * サムネイルを埋め込みプレイヤーへ切り替えて再生開始する。
     * @param {*} thumbDiv
     * @param {*} yt
     * @param {{ revealCard?: boolean } | undefined} options
     * @returns {Promise<boolean>}
     */
    function startEmbeddedPlayback(thumbDiv, yt, options) {
        const playbackSessionId = createPlaybackSessionId();
        const playbackStartPromise = createPlaybackStartAttempt(playbackSessionId);
        advancePlaybackTransitionGeneration();
        setActiveThumb(thumbDiv, { preserveTransitionGeneration: true });
        thumbDiv.dataset.videoId = yt.videoId;
        thumbDiv.dataset.playbackKey = buildPlaybackKey(yt);
        setPlaybackSessionId(thumbDiv, playbackSessionId);
        setYoutubeThumbnailOrientation(thumbDiv, yt && yt.isVertical ? "vertical" : "landscape");
        setYoutubeThumbnailPlaybackState(thumbDiv, "playing");
        setYoutubeThumbnailExpandedCardState(thumbDiv, Boolean(yt && yt.isVertical));
        Promise.resolve(mountSharedPlayback(thumbDiv, yt, playbackSessionId)).then((didMount) => {
            if (didMount) return;
            settlePlaybackStartAttempt(playbackSessionId, false);
            restoreThumbnail(thumbDiv, yt && yt.videoId ? yt.videoId : "");
        }).catch(() => {
            settlePlaybackStartAttempt(playbackSessionId, false);
            restoreThumbnail(thumbDiv, yt && yt.videoId ? yt.videoId : "");
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
     * @param {*} thumbDiv
     * @param {*} yt
     * @returns {Promise<boolean>}
     */
    function playThumbnail(thumbDiv, yt) {
        if (!isHtmlElement(thumbDiv)) return Promise.resolve(false);
        if (!playbackUi.showThumbnails) return Promise.resolve(false);
        if (!yt || !yt.videoId) return Promise.resolve(false);
        return startEmbeddedPlayback(thumbDiv, yt);
    }

    /**
     * 曲情報に合わせてサムネイル表示内容を更新する。
     * @param {*} thumbDiv
     * @param {*} yt
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
            startEmbeddedPlayback(thumbDiv, yt, { revealCard: true });
        };
        thumbDiv.appendChild(img);
        if (shouldLoadYoutubeThumbnailNow(thumbDiv)) {
            img.src = img.dataset.src;
        }
    }

    return {
        setLayoutHook,
        setPlaybackEndedHook,
        isIOSWebKit,
        ensureThumbnailPlaybackReady: ensureYoutubeApiForThumbnails,
        setupScrollObserver,
        playThumbnail,
        updateThumbnail,
        restoreActivePlayback
    };
}
