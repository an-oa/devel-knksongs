import { isHtmlElement } from "../dom-utils.mjs?v=19";

const YT_EMBED_HOST = "https://www.youtube.com";

/**
 * YouTube Iframe API の読み込み完了を扱うローダーを作成する。
 * @param {{ youtube: *, iframeApiSrc: string, iframeApiSelector: string, readyPollMs: number }} input
 */
export function createYoutubeIframeApiLoader({
    youtube,
    iframeApiSrc,
    iframeApiSelector,
    readyPollMs
}) {
    /**
     * YouTube Iframe API が利用可能か返す。
     * @returns {boolean}
     */
    function isReady() {
        return Boolean(window.YT && window.YT.Player);
    }

    /**
     * Iframe API が利用可能になるまでポーリングで待機する。
     * @param {Function} resolve
     */
    function waitForReady(resolve) {
        if (isReady()) {
            resolve();
            return;
        }
        setTimeout(() => waitForReady(resolve), readyPollMs);
    }

    /**
     * Iframe API スクリプトの読み込みと初期化完了を保証する。
     * @returns {Promise<void>}
     */
    function ensureReady() {
        if (isReady()) return Promise.resolve();
        if (youtube.apiPromise) return youtube.apiPromise;
        let script = null;
        let resolveReady = () => {};
        const prevCallback = window.onYouTubeIframeAPIReady;

        /**
         * このローダーが差し替えた ready callback を失敗時に戻す。
         */
        function restoreCallback() {
            if (window.onYouTubeIframeAPIReady === readyCallback) {
                window.onYouTubeIframeAPIReady = prevCallback;
            }
        }

        /**
         * 読み込みに失敗した Iframe API script を再試行前に取り除く。
         */
        function removeScript() {
            if (isHtmlElement(script) && script.parentElement) {
                script.parentElement.removeChild(script);
            }
        }

        /**
         * YouTube Iframe API の ready callback を処理する。
         */
        function readyCallback() {
            if (typeof prevCallback === "function") prevCallback();
            resolveReady();
        }

        const apiPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector(iframeApiSelector);
            resolveReady = resolve;
            window.onYouTubeIframeAPIReady = readyCallback;
            const rejectWithCleanup = (error) => {
                restoreCallback();
                removeScript();
                reject(error);
            };
            if (existing) {
                waitForReady(resolve);
                return;
            }
            script = document.createElement("script");
            script.src = iframeApiSrc;
            script.async = true;
            script.dataset.ytIframeApi = "true";
            script.onerror = () => rejectWithCleanup(new Error("iframe_api load failed"));
            document.head.appendChild(script);
        }).catch((error) => {
            if (youtube.apiPromise === apiPromise) {
                youtube.apiPromise = null;
            }
            throw error;
        });
        youtube.apiPromise = apiPromise;
        return youtube.apiPromise;
    }

    return {
        ensureReady
    };
}

/**
 * 埋め込み再生用の標準 YouTube URL を生成する。
 * @param {*} yt
 * @param {{ endSeconds?: number | null } | undefined} options
 * @returns {string}
 */
export function buildYoutubeEmbedUrl(yt, options) {
    const params = new URLSearchParams({
        autoplay: "1",
        playsinline: "1",
        start: String(yt.startSeconds),
        enablejsapi: "1",
        rel: "0",
        cc_load_policy: "0",
        iv_load_policy: "3"
    });
    const endSeconds = Number.isFinite(options && options.endSeconds)
        ? options.endSeconds
        : null;
    if (Number.isFinite(endSeconds)) {
        params.set("end", String(endSeconds));
    }
    if (location.origin !== "null") {
        params.set("origin", location.origin);
    }
    return `${YT_EMBED_HOST}/embed/${yt.videoId}?${params.toString()}`;
}

/**
 * YouTube が生成した iframe へ必要な属性を反映する。
 * @param {*} iframe
 */
export function applyYoutubePlayerIframeAttributes(iframe) {
    if (!isHtmlElement(iframe)) return;
    iframe.allow = "autoplay; encrypted-media";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
}

export { YT_EMBED_HOST };
