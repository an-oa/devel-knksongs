/**
 * extractYoutubeInfo を実行する
 * @param {*} url
 */
export function extractYoutubeInfo(url) {
    try {
        const u = new URL(url);
        const id = u.hostname === "youtu.be"
            ? u.pathname.slice(1)
            : (u.searchParams.get("v") || u.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] || u.pathname.match(/\/live\/([^/?#]+)/)?.[1]);
        const t = u.searchParams.get("t") || u.searchParams.get("start") || "0";
        return { videoId: id, startSeconds: parseInt(t, 10) || 0 };
    } catch {
        return { videoId: "", startSeconds: 0 };
    }
}

/**
 * createYoutubeController を実行する
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

    /**
     * setDisplayHook を実行する
     * @param {*} fn
     */
    function setDisplayHook(fn) {
        if (typeof fn === "function") {
            updateDisplay = fn;
        }
    }

    /**
     * isIOSWebKit を実行する
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
         * isReady を実行する
         */
        isReady() {
            return Boolean(window.YT && window.YT.Player);
        },
        /**
         * waitForReady を実行する
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
         * ensureReady を実行する
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
         * buildEmbedUrl を実行する
         * @param {*} yt
         */
        buildEmbedUrl(yt) {
            const origin = location.origin === "null"
                ? ""
                : `&origin=${encodeURIComponent(location.origin)}`;
            return `https://www.youtube-nocookie.com/embed/${yt.videoId}?autoplay=1&playsinline=1&start=${yt.startSeconds}&enablejsapi=1&rel=0&cc_load_policy=0&iv_load_policy=3${origin}`;
        },
        /**
         * handleStateChange を実行する
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
         * attachPlayer を実行する
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
         * destroyPlayer を実行する
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
     * ensureYoutubeApiForThumbnails を実行する
     */
    function ensureYoutubeApiForThumbnails() {
        if (!ui.showThumbnails) return;
        requestAnimationFrame(() => youtubeApi.ensureReady().catch(() => {}));
    }

    /**
     * setupThumbnailToggle を実行する
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
     * applyThumbnailFromStorage を実行する
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
     * resetThumbnailContainer を実行する
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
        thumbDiv.onclick = null;
        thumbDiv.replaceChildren();
    }

    /**
     * createThumbnailImage を実行する
     * @param {*} videoId
     */
    function createThumbnailImage(videoId) {
        const img = document.createElement("img");
        img.dataset.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        return img;
    }

    /**
     * applyThumbnailImage を実行する
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
     * shouldLoadThumbnailNow を実行する
     * @param {*} thumbDiv
     */
    function shouldLoadThumbnailNow(thumbDiv) {
        const rect = thumbDiv.getBoundingClientRect();
        const viewHeight = window.innerHeight || document.documentElement.clientHeight;
        return rect.bottom > 0 && rect.top < viewHeight;
    }

    /**
     * setPlaybackState を実行する
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
     * buildPlaybackKey を実行する
     * @param {*} yt
     */
    function buildPlaybackKey(yt) {
        if (!yt.videoId) return "";
        return `${yt.videoId}:${yt.startSeconds}`;
    }

    /**
     * isSamePlaybackTarget を実行する
     * @param {*} thumbDiv
     * @param {*} nextPlaybackKey
     */
    function isSamePlaybackTarget(thumbDiv, nextPlaybackKey) {
        if (!ui.showThumbnails) return false;
        if (!thumbDiv.querySelector("iframe")) return false;
        return (thumbDiv.dataset.playbackKey || "") === nextPlaybackKey;
    }

    /**
     * setActiveThumb を実行する
     * @param {*} thumbDiv
     */
    function setActiveThumb(thumbDiv) {
        if (ui.activeThumb && ui.activeThumb !== thumbDiv) {
            restoreThumbnail(ui.activeThumb, ui.activeThumb.dataset.videoId || "");
        }
        ui.activeThumb = thumbDiv;
    }

    /**
     * clearActiveThumb を実行する
     * @param {*} thumbDiv
     */
    function clearActiveThumb(thumbDiv) {
        if (ui.activeThumb === thumbDiv) ui.activeThumb = null;
    }

    /**
     * handleScrollObserver を実行する
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
                if (videoId) {
                    applyThumbnailImage(thumb, videoId);
                } else {
                    thumb.replaceChildren();
                }
            }
        });
    }

    /**
     * setupScrollObserver を実行する
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
     * restoreThumbnail を実行する
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
        setPlaybackState(thumbDiv, "stopped");
        if (videoId) {
            applyThumbnailImage(thumbDiv, videoId, { eager: true });
        } else {
            thumbDiv.replaceChildren();
        }
    }

    /**
     * restoreActivePlayback を実行する
     */
    function restoreActivePlayback() {
        const activeThumb = ui.activeThumb;
        if (!activeThumb) return;
        restoreThumbnail(activeThumb, activeThumb.dataset.videoId || "");
    }

    /**
     * startEmbeddedPlayback を実行する
     * @param {*} thumbDiv
     * @param {*} yt
     */
    function startEmbeddedPlayback(thumbDiv, yt) {
        setActiveThumb(thumbDiv);
        thumbDiv.dataset.videoId = yt.videoId;
        thumbDiv.dataset.playbackKey = buildPlaybackKey(yt);
        setPlaybackState(thumbDiv, "playing");
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
    }

    /**
     * updateThumbnail を実行する
     * @param {*} thumbDiv
     * @param {*} yt
     */
    function updateThumbnail(thumbDiv, yt) {
        const nextPlaybackKey = buildPlaybackKey(yt);
        if (isSamePlaybackTarget(thumbDiv, nextPlaybackKey)) {
            thumbDiv.dataset.videoId = yt.videoId;
            return;
        }
        resetThumbnailContainer(thumbDiv, yt.videoId, nextPlaybackKey);

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
        isIOSWebKit,
        setupThumbnailToggle,
        applyThumbnailFromStorage,
        setupScrollObserver,
        updateThumbnail,
        restoreActivePlayback
    };
}
