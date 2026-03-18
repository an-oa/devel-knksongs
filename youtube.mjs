import { createLayoutRefreshScheduler } from "./layout-anchor.mjs?v=7";

export { extractYoutubeInfo } from "./youtube-url.mjs?v=7";

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
    let updateDisplay = () => {};
    let refreshLayout = () => {};
    const refreshCardLayoutSoon = createLayoutRefreshScheduler(() => refreshLayout);

    /**
     * サムネイル設定変更時に呼ぶ表示更新フックを登録する。
     * @param {*} fn
     */
    function setDisplayHook(fn) {
        if (typeof fn === "function") {
            updateDisplay = fn;
        }
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
         * 埋め込み再生用の `youtube-nocookie` URLを生成する。
         * @param {*} yt
         */
        buildEmbedUrl(yt) {
            const origin = location.origin === "null"
                ? ""
                : `&origin=${encodeURIComponent(location.origin)}`;
            return `https://www.youtube-nocookie.com/embed/${yt.videoId}?autoplay=1&playsinline=1&start=${yt.startSeconds}&enablejsapi=1&rel=0&cc_load_policy=0&iv_load_policy=3${origin}`;
        },
        /**
         * プレイヤー状態変化に応じて再生状態表示を更新する。
         * @param {*} thumbDiv
         * @param {*} event
         */
        handleStateChange(thumbDiv, event) {
            if (event.data === window.YT.PlayerState.PAUSED ||
                event.data === window.YT.PlayerState.ENDED) {
                setPlaybackState(thumbDiv, "stopped");
                return;
            }
            if (event.data === window.YT.PlayerState.PLAYING) {
                setPlaybackState(thumbDiv, "playing");
            }
        },
        /**
         * 生成済みiframeへYouTubeプレイヤーを紐付ける。
         * @param {*} thumbDiv
         * @param {*} iframe
         * @param {*} yt
         */
        attachPlayer(thumbDiv, iframe, yt) {
            this.ensureReady().then(() => {
                if (!document.body.contains(iframe)) return;
                if (youtube.players.has(thumbDiv)) return;
                const player = new window.YT.Player(iframe, {
                    host: "https://www.youtube-nocookie.com",
                    events: {
                        onStateChange: (event) => this.handleStateChange(thumbDiv, event)
                    }
                });
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
        if (!ui.showThumbnails) return;
        requestAnimationFrame(() => youtubeApi.ensureReady().catch(() => {}));
    }

    /**
     * サムネイル表示トグルを初期化し、変更イベントを設定する。
     */
    function setupThumbnailToggle() {
        const thumbToggle = ui.el.thumbToggle;
        const savedSetting = localStorage.getItem("showThumbnails");
        const isShow = savedSetting !== null ? (savedSetting === "true") : false;
        ui.showThumbnails = isShow;

        if (thumbToggle) thumbToggle.checked = isShow;
        if (!isShow) document.body.classList.add("hide-thumbs");
        ensureYoutubeApiForThumbnails();

        if (!thumbToggle) return;
        thumbToggle.addEventListener("change", () => {
            const checked = thumbToggle.checked;
            ui.showThumbnails = checked;
            document.body.classList.toggle("hide-thumbs", !checked);
            localStorage.setItem("showThumbnails", checked);
            ensureYoutubeApiForThumbnails();
            updateDisplay();
            setupScrollObserver();
        });
    }

    /**
     * 保存済みサムネイル表示設定をUIへ反映する。
     */
    function applyThumbnailFromStorage() {
        const thumbToggle = ui.el.thumbToggle;
        const savedSetting = localStorage.getItem("showThumbnails");
        const isShow = savedSetting !== null ? (savedSetting === "true") : false;
        const prev = ui.showThumbnails;
        ui.showThumbnails = isShow;
        if (thumbToggle) thumbToggle.checked = isShow;
        document.body.classList.toggle("hide-thumbs", !isShow);
        ensureYoutubeApiForThumbnails();
        if (prev !== isShow && ui.dataReady) {
            updateDisplay();
            setupScrollObserver();
        }
    }

    /**
     * サムネイルコンテナを再生状態から初期表示へリセットする。
     * @param {*} thumbDiv
     * @param {*} videoId
     * @param {*} playbackKey
     */
    function resetThumbnailContainer(thumbDiv, videoId, playbackKey) {
        const iframe = thumbDiv.querySelector("iframe");
        if (iframe) {
            clearActiveThumb(thumbDiv);
            youtubeApi.destroyPlayer(thumbDiv);
            iframe.src = "about:blank";
        }
        thumbDiv.dataset.videoId = videoId;
        thumbDiv.dataset.playbackKey = playbackKey;
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
     * 再生対象の同一性判定に使うキーを生成する。
     * @param {*} yt
     */
    function buildPlaybackKey(yt) {
        if (!yt.videoId) return "";
        return `${yt.videoId}:${yt.startSeconds}`;
    }

    /**
     * 現在表示中の再生対象と次の対象が同一か判定する。
     * @param {*} thumbDiv
     * @param {*} nextPlaybackKey
     */
    function isSamePlaybackTarget(thumbDiv, nextPlaybackKey) {
        if (!ui.showThumbnails) return false;
        if (!thumbDiv.querySelector("iframe")) return false;
        return (thumbDiv.dataset.playbackKey || "") === nextPlaybackKey;
    }

    /**
     * アクティブなサムネイルを切り替える。
     * @param {*} thumbDiv
     */
    function setActiveThumb(thumbDiv) {
        if (ui.activeThumb && ui.activeThumb !== thumbDiv) {
            restoreThumbnail(ui.activeThumb, ui.activeThumb.dataset.videoId || "");
        }
        ui.activeThumb = thumbDiv;
    }

    /**
     * 指定サムネイルがアクティブなら参照を解除する。
     * @param {*} thumbDiv
     */
    function clearActiveThumb(thumbDiv) {
        if (ui.activeThumb === thumbDiv) ui.activeThumb = null;
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
                const iframe = thumb.querySelector("iframe");
                if (!iframe) return;
                iframe.src = "about:blank";
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
        if (ui.scrollObserver) ui.scrollObserver.disconnect();
        ui.scrollObserver = new IntersectionObserver(handleScrollObserver, {
            threshold: 0,
            rootMargin: `-${headerHeight}px 0px 0px 0px`
        });
        if (!ui.showThumbnails) return;
        document.querySelectorAll(".thumb").forEach((thumb) => {
            ui.scrollObserver.observe(thumb);
        });
    }

    /**
     * 埋め込み再生を解除して通常サムネイル表示へ戻す。
     * @param {*} thumbDiv
     * @param {*} videoId
     */
    function restoreThumbnail(thumbDiv, videoId) {
        clearActiveThumb(thumbDiv);
        youtubeApi.destroyPlayer(thumbDiv);
        const iframe = thumbDiv.querySelector("iframe");
        if (iframe) iframe.src = "about:blank";
        thumbDiv.dataset.videoId = videoId;
        thumbDiv.dataset.playbackKey = "";
        setThumbnailOrientation(thumbDiv, "landscape");
        setPlaybackState(thumbDiv, "stopped");
        setExpandedCardState(thumbDiv, false);
        if (videoId) {
            applyThumbnailImage(thumbDiv, videoId, { eager: true });
        } else {
            thumbDiv.replaceChildren();
        }
        refreshCardLayoutSoon(thumbDiv);
    }

    /**
     * 現在アクティブな再生サムネイルを通常表示へ復元する。
     */
    function restoreActivePlayback() {
        const activeThumb = ui.activeThumb;
        if (!activeThumb) return;
        if (!activeThumb.isConnected) {
            ui.activeThumb = null;
            return;
        }
        restoreThumbnail(activeThumb, activeThumb.dataset.videoId || "");
    }

    /**
     * サムネイルを埋め込みプレイヤーへ切り替えて再生開始する。
     * @param {*} thumbDiv
     * @param {*} yt
     */
    function startEmbeddedPlayback(thumbDiv, yt) {
        setActiveThumb(thumbDiv);
        thumbDiv.dataset.videoId = yt.videoId;
        thumbDiv.dataset.playbackKey = buildPlaybackKey(yt);
        setThumbnailOrientation(thumbDiv, yt && yt.isVertical ? "vertical" : "landscape");
        setPlaybackState(thumbDiv, "playing");
        setExpandedCardState(thumbDiv, Boolean(yt && yt.isVertical));
        const ifr = document.createElement("iframe");
        ifr.src = youtubeApi.buildEmbedUrl(yt);
        ifr.allow = "autoplay; encrypted-media";
        ifr.referrerPolicy = "strict-origin-when-cross-origin";
        ifr.allowFullscreen = true;
        const close = document.createElement("button");
        close.type = "button";
        close.className = "thumb-close-btn";
        close.setAttribute("aria-label", "サムネイルに戻す");
        close.innerHTML = "&times;";
        close.addEventListener("click", (e) => {
            e.stopPropagation();
            restoreThumbnail(thumbDiv, yt.videoId);
        });
        thumbDiv.replaceChildren(ifr, close);
        youtubeApi.attachPlayer(thumbDiv, ifr, yt);
        if (yt && yt.isVertical) {
            refreshCardLayoutSoon(thumbDiv);
        }
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

        if (!ui.showThumbnails) return;
        if (!yt.videoId) return;

        const img = createThumbnailImage(yt.videoId);
        thumbDiv.onclick = () => {
            if (thumbDiv.classList.contains("playing")) return;
            startEmbeddedPlayback(thumbDiv, yt);
        };
        thumbDiv.appendChild(img);
        if (shouldLoadThumbnailNow(thumbDiv)) {
            img.src = img.dataset.src;
        }
    }

    return {
        setDisplayHook,
        setLayoutHook,
        isIOSWebKit,
        setupThumbnailToggle,
        applyThumbnailFromStorage,
        setupScrollObserver,
        updateThumbnail,
        restoreActivePlayback
    };
}
