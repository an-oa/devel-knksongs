import { createLayoutRefreshScheduler } from "../lib/layout-anchor.mjs?v=11";
import { scheduleScrollElementIntoView } from "../lib/results-scroll.mjs?v=11";
import { getPlaybackUiState } from "../lib/ui-slices.mjs?v=11";

export { extractYoutubeInfo } from "../lib/youtube-url.mjs?v=11";

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
    const YT_EMBED_HOST = "https://www.youtube.com";

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
        /**
         * YouTube Iframe APIが利用可能かを判定する。
         */
        isReady() {
            return Boolean(window.YT && window.YT.Player);
        },
        /**
         * Iframe APIが利用可能になるまでポーリングで待機する。
         * @param {*} resolve
         */
        waitForReady(resolve) {
            if (this.isReady()) {
                resolve();
                return;
            }
            setTimeout(() => this.waitForReady(resolve), YT_IFRAME_READY_POLL_MS);
        },
        /**
         * Iframe APIスクリプトの読み込みと初期化完了を保証する。
         */
        ensureReady() {
            if (this.isReady()) return Promise.resolve();
            if (youtube.apiPromise) return youtube.apiPromise;
            youtube.apiPromise = new Promise((resolve, reject) => {
                const existing = document.querySelector(YT_IFRAME_API_SELECTOR);
                const prevCallback = window.onYouTubeIframeAPIReady;
                window.onYouTubeIframeAPIReady = () => {
                    if (typeof prevCallback === "function") prevCallback();
                    resolve();
                };
                if (existing) {
                    this.waitForReady(resolve);
                    return;
                }
                const script = document.createElement("script");
                script.src = YT_IFRAME_API_SRC;
                script.async = true;
                script.dataset.ytIframeApi = "true";
                script.onerror = () => reject(new Error("iframe_api load failed"));
                document.head.appendChild(script);
            });
            return youtube.apiPromise;
        },
        /**
         * 初期再生に必要なプレーヤーパラメータを生成する。
         * @param {*} yt
         */
        buildPlayerVars(yt) {
            const vars = {
                autoplay: 1,
                playsinline: 1,
                start: yt.startSeconds,
                enablejsapi: 1,
                rel: 0,
                cc_load_policy: 0,
                iv_load_policy: 3
            };
            const endSeconds = getEffectiveEndSeconds(yt);
            if (Number.isFinite(endSeconds)) {
                vars.end = endSeconds;
            }
            if (location.origin !== "null") {
                vars.origin = location.origin;
            }
            return vars;
        },
        /**
         * YouTube が生成した iframe へ必要な属性を反映する。
         * @param {*} iframe
         */
        applyPlayerIframeAttributes(iframe) {
            if (!(iframe instanceof HTMLElement)) return;
            iframe.allow = "autoplay; encrypted-media";
            iframe.referrerPolicy = "strict-origin-when-cross-origin";
            iframe.allowFullscreen = true;
        },
        /**
         * プレイヤー状態変化に応じて再生状態表示を更新する。
         * @param {*} thumbDiv
         * @param {*} event
         */
        handleStateChange(thumbDiv, event, playbackSessionId) {
            if (!isCurrentPlaybackSession(thumbDiv, playbackSessionId)) return;
            if (event.data === window.YT.PlayerState.ENDED) {
                const endedSongKey = getSongKeyFromThumb(thumbDiv);
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
                setPlaybackState(thumbDiv, "stopped");
                return;
            }
            if (event.data === window.YT.PlayerState.PLAYING) {
                setPlaybackState(thumbDiv, "playing");
            }
        },
        /**
         * プレーヤーホスト要素へYouTubeプレイヤーを紐付ける。
         * @param {*} thumbDiv
         * @param {*} playerHost
         * @param {*} yt
         */
        attachPlayer(thumbDiv, playerHost, yt, playbackSessionId) {
            this.ensureReady().then(() => {
                if (!document.body.contains(playerHost)) return;
                if (youtube.players.has(thumbDiv)) return;
                const player = new window.YT.Player(playerHost, {
                    host: YT_EMBED_HOST,
                    videoId: yt.videoId,
                    playerVars: this.buildPlayerVars(yt),
                    events: {
                        onReady: (event) => {
                            this.applyPlayerIframeAttributes(
                                event && event.target && typeof event.target.getIframe === "function"
                                    ? event.target.getIframe()
                                    : null
                            );
                        },
                        onStateChange: (event) => this.handleStateChange(thumbDiv, event, playbackSessionId)
                    }
                });
                this.applyPlayerIframeAttributes(
                    typeof player.getIframe === "function" ? player.getIframe() : null
                );
                youtube.players.set(thumbDiv, player);
            }).catch(() => {
                // API読み込み失敗時は埋め込みのみで継続する
            });
        },
        /**
         * 指定サムネイルに紐づくプレイヤーを破棄する。
         * @param {*} thumbDiv
         */
        destroyPlayer(thumbDiv) {
            const player = youtube.players.get(thumbDiv);
            if (!player) return;
            if (typeof player.destroy === "function") {
                player.destroy();
            }
            youtube.players.delete(thumbDiv);
        }
    };

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
        const value = thumbDiv instanceof HTMLElement ? thumbDiv.dataset.playbackSessionId : "";
        const sessionId = Number.parseInt(String(value || ""), 10);
        return Number.isFinite(sessionId) ? sessionId : 0;
    }

    /**
     * サムネイルに再生セッションIDを設定または解除する。
     * @param {*} thumbDiv
     * @param {number} sessionId
     */
    function setPlaybackSessionId(thumbDiv, sessionId) {
        if (!(thumbDiv instanceof HTMLElement)) return;
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
        const iframe = thumbDiv.querySelector("iframe");
        if (iframe || thumbDiv.querySelector(".youtube-player-host") || youtube.players.has(thumbDiv)) {
            clearActiveThumb(thumbDiv);
            youtubeApi.destroyPlayer(thumbDiv);
            if (iframe) iframe.src = "about:blank";
        }
        thumbDiv.dataset.videoId = videoId;
        thumbDiv.dataset.playbackKey = playbackKey;
        setPlaybackSessionId(thumbDiv, 0);
        thumbDiv.classList.remove("playing");
        setExpandedCardState(thumbDiv, false);
        thumbDiv.onclick = null;
        thumbDiv.replaceChildren();
    }

    /**
     * 遅延読み込み用のサムネイル画像要素を生成する。
     * @param {*} videoId
     */
    function createThumbnailImage(videoId) {
        const img = document.createElement("img");
        img.dataset.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        return img;
    }

    /**
     * サムネイル画像をコンテナへ適用する。
     * @param {*} thumbDiv
     * @param {*} videoId
     * @param {*} options
     */
    function applyThumbnailImage(thumbDiv, videoId, options) {
        const img = createThumbnailImage(videoId);
        if (options && options.eager) img.src = img.dataset.src;
        thumbDiv.replaceChildren(img);
    }

    /**
     * サムネイルを即時読み込みすべき可視領域内か判定する。
     * @param {*} thumbDiv
     */
    function shouldLoadThumbnailNow(thumbDiv) {
        const rect = thumbDiv.getBoundingClientRect();
        const viewHeight = window.innerHeight || document.documentElement.clientHeight;
        return rect.bottom > 0 && rect.top < viewHeight;
    }

    /**
     * サムネイル要素の再生状態クラスを更新する。
     * @param {*} thumbDiv
     * @param {*} state
     */
    function setPlaybackState(thumbDiv, state) {
        thumbDiv.classList.remove("playing");
        if (state === "playing") {
            thumbDiv.classList.add("playing");
        }
    }

    /**
     * サムネイル/プレイヤー枠の向きをデータ属性へ反映する。
     * @param {*} thumbDiv
     * @param {*} yt
     */
    function setThumbnailOrientation(thumbDiv, orientation) {
        thumbDiv.dataset.videoOrientation = orientation === "vertical" ? "vertical" : "landscape";
    }

    /**
     * 縦再生で前面表示が必要なカード状態を切り替える。
     * @param {*} thumbDiv
     * @param {*} isExpanded
     */
    function setExpandedCardState(thumbDiv, isExpanded) {
        const card = thumbDiv instanceof HTMLElement ? thumbDiv.closest(".song-card") : null;
        if (!(card instanceof HTMLElement)) return;
        card.classList.toggle("song-card-expanded", Boolean(isExpanded));
    }

    /**
     * サムネイルに対応する曲キーを返す。
     * @param {*} thumbDiv
     * @returns {string}
     */
    function getSongKeyFromThumb(thumbDiv) {
        const card = thumbDiv instanceof HTMLElement ? thumbDiv.closest(".song-card") : null;
        return card instanceof HTMLElement ? (card.dataset.songKey || "") : "";
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
     * 埋め込み再生用の要素またはプレイヤー参照が存在するか判定する。
     * @param {*} thumbDiv
     */
    function hasEmbeddedPlaybackTarget(thumbDiv) {
        return Boolean(
            thumbDiv.querySelector("iframe") ||
            thumbDiv.querySelector(".youtube-player-host") ||
            youtube.players.has(thumbDiv)
        );
    }

    /**
     * 現在表示中の再生対象と次の対象が同一か判定する。
     * @param {*} thumbDiv
     * @param {*} nextPlaybackKey
     */
    function isSamePlaybackTarget(thumbDiv, nextPlaybackKey) {
        if (!playbackUi.showThumbnails) return false;
        if (!hasEmbeddedPlaybackTarget(thumbDiv)) return false;
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
                if (!hasEmbeddedPlaybackTarget(thumb)) return;
                const iframe = thumb.querySelector("iframe");
                youtubeApi.destroyPlayer(thumb);
                if (iframe) iframe.src = "about:blank";
                const videoId = thumb.dataset.videoId;
                thumb.classList.remove("playing");
                setThumbnailOrientation(thumb, "landscape");
                setExpandedCardState(thumb, false);
                if (videoId) {
                    applyThumbnailImage(thumb, videoId);
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
        clearActiveThumb(thumbDiv);
        youtubeApi.destroyPlayer(thumbDiv);
        const iframe = thumbDiv.querySelector("iframe");
        if (iframe) iframe.src = "about:blank";
        thumbDiv.dataset.videoId = videoId;
        thumbDiv.dataset.playbackKey = "";
        setPlaybackSessionId(thumbDiv, 0);
        setThumbnailOrientation(thumbDiv, "landscape");
        setPlaybackState(thumbDiv, "stopped");
        setExpandedCardState(thumbDiv, false);
        if (videoId) {
            applyThumbnailImage(thumbDiv, videoId, { eager: true });
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
     * 再生開始したカードが見切れている場合は見える位置まで寄せる。
     * @param {*} thumbDiv
     */
    function revealPlaybackCardIfNeeded(thumbDiv) {
        const card = thumbDiv instanceof HTMLElement ? thumbDiv.closest(".song-card") : null;
        if (!(card instanceof HTMLElement)) return;
        const header = document.querySelector(".header");
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        scheduleScrollElementIntoView(card, {
            topOffset: headerHeight,
            behavior: "smooth"
        });
    }

    /**
     * サムネイルを埋め込みプレイヤーへ切り替えて再生開始する。
     * @param {*} thumbDiv
     * @param {*} yt
     * @param {{ revealCard?: boolean } | undefined} options
     */
    function startEmbeddedPlayback(thumbDiv, yt, options) {
        const playbackSessionId = createPlaybackSessionId();
        advancePlaybackTransitionGeneration();
        setActiveThumb(thumbDiv, { preserveTransitionGeneration: true });
        thumbDiv.dataset.videoId = yt.videoId;
        thumbDiv.dataset.playbackKey = buildPlaybackKey(yt);
        setPlaybackSessionId(thumbDiv, playbackSessionId);
        setThumbnailOrientation(thumbDiv, yt && yt.isVertical ? "vertical" : "landscape");
        setPlaybackState(thumbDiv, "playing");
        setExpandedCardState(thumbDiv, Boolean(yt && yt.isVertical));
        const playerHost = document.createElement("div");
        playerHost.className = "youtube-player-host";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "thumb-close-btn";
        close.setAttribute("aria-label", "サムネイルに戻す");
        close.innerHTML = "&times;";
        close.addEventListener("click", (e) => {
            e.stopPropagation();
            restoreThumbnail(thumbDiv, yt.videoId);
        });
        thumbDiv.replaceChildren(playerHost, close);
        youtubeApi.attachPlayer(thumbDiv, playerHost, yt, playbackSessionId);
        if (yt && yt.isVertical) {
            refreshCardLayoutSoon(thumbDiv);
        }
        if (options && options.revealCard) {
            revealPlaybackCardIfNeeded(thumbDiv);
        }
    }

    /**
     * 指定サムネイルを即座に埋め込み再生へ切り替える。
     * @param {*} thumbDiv
     * @param {*} yt
     * @returns {boolean}
     */
    function playThumbnail(thumbDiv, yt) {
        if (!(thumbDiv instanceof HTMLElement)) return false;
        if (!playbackUi.showThumbnails) return false;
        if (!yt || !yt.videoId) return false;
        startEmbeddedPlayback(thumbDiv, yt);
        return true;
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
            setThumbnailOrientation(thumbDiv, yt && yt.isVertical ? "vertical" : "landscape");
            return;
        }
        resetThumbnailContainer(thumbDiv, yt.videoId, nextPlaybackKey);
        setThumbnailOrientation(thumbDiv, "landscape");

        if (!playbackUi.showThumbnails) return;
        if (!yt.videoId) return;

        const img = createThumbnailImage(yt.videoId);
        thumbDiv.onclick = () => {
            if (thumbDiv.classList.contains("playing")) return;
            startEmbeddedPlayback(thumbDiv, yt, { revealCard: true });
        };
        thumbDiv.appendChild(img);
        if (shouldLoadThumbnailNow(thumbDiv)) {
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
