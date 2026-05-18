import { canUseDom, getHeaderHeight, isHtmlElement } from "../dom-utils.mjs?v=19";
import { scheduleScrollElementIntoView } from "../results-scroll.mjs?v=19";

/**
 * 遅延読み込み用のサムネイル画像要素を生成する。
 * @param {string} videoId
 * @returns {*}
 */
export function createYoutubeThumbnailImage(videoId) {
    if (!canUseDom()) return null;
    const img = document.createElement("img");
    img.dataset.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    return img;
}

/**
 * サムネイル画像をコンテナへ適用する。
 * @param {*} thumbDiv
 * @param {string} videoId
 * @param {{ eager?: boolean } | undefined} options
 */
export function applyYoutubeThumbnailImage(thumbDiv, videoId, options) {
    const img = createYoutubeThumbnailImage(videoId);
    if (!isHtmlElement(img)) return;
    if (options && options.eager) img.src = img.dataset.src;
    thumbDiv.replaceChildren(img);
}

/**
 * サムネイルを即時読み込みすべき可視領域内か判定する。
 * @param {*} thumbDiv
 * @returns {boolean}
 */
export function shouldLoadYoutubeThumbnailNow(thumbDiv) {
    const rect = thumbDiv.getBoundingClientRect();
    const viewHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.bottom > 0 && rect.top < viewHeight;
}

/**
 * サムネイル要素の再生状態クラスを更新する。
 * @param {*} thumbDiv
 * @param {string} state
 */
export function setYoutubeThumbnailPlaybackState(thumbDiv, state) {
    thumbDiv.classList.remove("playing");
    if (state === "playing") {
        thumbDiv.classList.add("playing");
    }
}

/**
 * サムネイル/プレイヤー枠の向きをデータ属性へ反映する。
 * @param {*} thumbDiv
 * @param {string} orientation
 */
export function setYoutubeThumbnailOrientation(thumbDiv, orientation) {
    thumbDiv.dataset.videoOrientation = orientation === "vertical" ? "vertical" : "landscape";
}

/**
 * 縦再生で前面表示が必要なカード状態を切り替える。
 * @param {*} thumbDiv
 * @param {*} isExpanded
 */
export function setYoutubeThumbnailExpandedCardState(thumbDiv, isExpanded) {
    const card = isHtmlElement(thumbDiv) ? thumbDiv.closest(".song-card") : null;
    if (!isHtmlElement(card)) return;
    card.classList.toggle("song-card-expanded", Boolean(isExpanded));
}

/**
 * サムネイルに対応する曲キーを返す。
 * @param {*} thumbDiv
 * @returns {string}
 */
export function getSongKeyFromYoutubeThumb(thumbDiv) {
    const card = isHtmlElement(thumbDiv) ? thumbDiv.closest(".song-card") : null;
    return isHtmlElement(card) ? (card.dataset.songKey || "") : "";
}

/**
 * 再生開始したカードが見切れている場合は見える位置まで寄せる。
 * @param {*} thumbDiv
 */
export function revealYoutubePlaybackCardIfNeeded(thumbDiv) {
    const card = isHtmlElement(thumbDiv) ? thumbDiv.closest(".song-card") : null;
    if (!isHtmlElement(card)) return;
    scheduleScrollElementIntoView(card, {
        topOffset: getHeaderHeight(),
        behavior: "smooth"
    });
}
