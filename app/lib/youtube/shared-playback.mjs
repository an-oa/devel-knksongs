import { canUseDom, isHtmlElement } from "../dom-utils.mjs?v=18";

/**
 * 共有埋め込みプレーヤーの保持領域を返す。
 * @param {*} youtube
 * @returns {*}
 */
export function getYoutubeSharedPlaybackState(youtube) {
    if (!youtube.sharedPlayback) {
        youtube.sharedPlayback = {
            player: null,
            playerPromise: null,
            pendingAttach: null,
            iframe: null,
            closeButton: null,
            parkingNode: null,
            hostThumb: null,
            sessionId: 0,
            playbackStartAttempt: null,
            unconfirmedPlaybackStartSessionId: 0
        };
    }
    return youtube.sharedPlayback;
}

/**
 * 共有プレーヤーが内部で置き換えた最新の iframe 要素を同期する。
 * @param {*} youtube
 * @returns {*}
 */
export function syncYoutubeSharedPlaybackIframe(youtube) {
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
    const player = sharedPlayback.player;
    if (player && typeof player.getIframe === "function") {
        const iframe = player.getIframe();
        if (isHtmlElement(iframe)) {
            sharedPlayback.iframe = iframe;
        }
    }
    return sharedPlayback.iframe;
}

/**
 * 共有プレーヤーに紐づく再生セッション ID を設定する。
 * @param {*} youtube
 * @param {number} sessionId
 */
export function setYoutubeSharedPlaybackSessionId(youtube, sessionId) {
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
    sharedPlayback.sessionId = Number.isFinite(sessionId) && sessionId > 0 ? sessionId : 0;
}

/**
 * 共有プレーヤー初期化待ち中に使う最新の紐付け要求を保存する。
 * @param {*} youtube
 * @param {*} iframe
 * @param {number} playbackSessionId
 */
export function setPendingYoutubeSharedPlaybackAttach(youtube, iframe, playbackSessionId) {
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
    sharedPlayback.pendingAttach = {
        iframe,
        playbackSessionId
    };
}

/**
 * 指定セッションの現在の再生サムネイルを返す。
 * @param {*} youtube
 * @param {number} sessionId
 * @returns {*}
 */
export function getYoutubeSharedPlaybackThumb(youtube, sessionId) {
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
    if (!(Number.isFinite(sessionId) && sessionId > 0)) return null;
    if (sharedPlayback.sessionId !== sessionId) return null;
    return isHtmlElement(sharedPlayback.hostThumb) ? sharedPlayback.hostThumb : null;
}

/**
 * 共有 iframe と閉じるボタンを必要に応じて生成する。
 * @param {{ youtube: *, syncIframe: Function, createFrame: Function, createCloseButton: Function }} input
 * @returns {*}
 */
export function ensureYoutubeSharedPlaybackElements({
    youtube,
    syncIframe,
    createFrame,
    createCloseButton
}) {
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
    if (typeof syncIframe === "function") {
        syncIframe();
    }
    if (!isHtmlElement(sharedPlayback.iframe)) {
        sharedPlayback.iframe = typeof createFrame === "function" ? createFrame() : null;
    }
    if (!isHtmlElement(sharedPlayback.closeButton)) {
        sharedPlayback.closeButton = typeof createCloseButton === "function"
            ? createCloseButton()
            : null;
    }
    return sharedPlayback;
}

/**
 * 共有プレーヤーの退避先ノードを返す。
 * DOM 退避先の生成と再利用を単体テストするため export している。
 * @param {*} youtube
 * @returns {HTMLElement | null}
 */
export function ensureYoutubeSharedPlaybackParkingNode(youtube) {
    if (!canUseDom()) return null;
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
    if (isHtmlElement(sharedPlayback.parkingNode) && document.body.contains(sharedPlayback.parkingNode)) {
        return sharedPlayback.parkingNode;
    }
    const parkingNode = document.createElement("div");
    parkingNode.hidden = true;
    parkingNode.setAttribute("aria-hidden", "true");
    document.body.appendChild(parkingNode);
    sharedPlayback.parkingNode = parkingNode;
    return parkingNode;
}

/**
 * 共有プレーヤー実体を破棄し、再生成できる初期状態へ戻す。
 * @param {{ youtube: *, syncIframe?: Function, debug?: Function }} input
 */
export function destroyYoutubeSharedPlayback({ youtube, syncIframe, debug }) {
    const sharedPlayback = getYoutubeSharedPlaybackState(youtube);
    const iframe = (typeof syncIframe === "function" ? syncIframe() : null) || sharedPlayback.iframe;
    if (typeof debug === "function") {
        debug("destroySharedPlayback", {
            hasPlayer: Boolean(sharedPlayback.player),
            hasIframe: isHtmlElement(iframe)
        });
    }
    if (sharedPlayback.player && typeof sharedPlayback.player.destroy === "function") {
        try {
            sharedPlayback.player.destroy();
        } catch {
            if (typeof debug === "function") {
                debug("destroySharedPlayback failed");
            }
        }
    }
    if (isHtmlElement(iframe) && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
    }
    if (isHtmlElement(sharedPlayback.closeButton) && sharedPlayback.closeButton.parentNode) {
        sharedPlayback.closeButton.parentNode.removeChild(sharedPlayback.closeButton);
    }
    if (isHtmlElement(sharedPlayback.parkingNode)) {
        sharedPlayback.parkingNode.replaceChildren();
    }
    sharedPlayback.player = null;
    sharedPlayback.playerPromise = null;
    sharedPlayback.pendingAttach = null;
    sharedPlayback.iframe = null;
    sharedPlayback.hostThumb = null;
    sharedPlayback.sessionId = 0;
}
