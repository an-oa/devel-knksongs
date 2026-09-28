import { canUseDom, getHeaderHeight, isHtmlElement } from "../dom-utils.mjs";
import { scheduleScrollElementIntoView } from "../results-scroll.mjs";

/**
 * サムネイル上のブラウザ標準保存導線をキャンセルする。
 * 本番コードではこの module 内の設定関数から使い、境界条件を単体テストするために export している。
 * @param {{ preventDefault?: () => void } | null | undefined} event
 */
export function preventYoutubeThumbnailDefaultAction(event: { preventDefault?: () => void } | null | undefined) {
    if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
    }
}

/**
 * サムネイルコンテナの右クリックメニューを抑止する。
 * @param {Element | null | undefined} thumbDiv
 */
export function suppressYoutubeThumbnailContextMenu(thumbDiv: Element | null | undefined) {
    if (!isHtmlElement(thumbDiv)) return;
    thumbDiv.addEventListener("contextmenu", preventYoutubeThumbnailDefaultAction);
}

/**
 * サムネイル画像の右クリックメニューとドラッグ保存を抑止する。
 * @param {Element | null | undefined} img
 */
export function suppressYoutubeThumbnailImageSaveActions(img: Element | null | undefined) {
    if (!isHtmlElement(img)) return;
    img.draggable = false;
    img.setAttribute("draggable", "false");
    img.addEventListener("contextmenu", preventYoutubeThumbnailDefaultAction);
    img.addEventListener("dragstart", preventYoutubeThumbnailDefaultAction);
}

/**
 * 遅延読み込み用のサムネイル画像要素を生成する。
 * @param {string} videoId
 * @returns {HTMLImageElement | null}
 */
export function createYoutubeThumbnailImage(videoId: string) {
    if (!canUseDom()) return null;
    const img = document.createElement("img");
    img.dataset.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    suppressYoutubeThumbnailImageSaveActions(img);
    return img;
}

/**
 * サムネイル画像をコンテナへ適用する。
 * @param {HTMLElement} thumbDiv
 * @param {string} videoId
 * @param {{ eager?: boolean }} [options]
 */
export function applyYoutubeThumbnailImage(thumbDiv: HTMLElement, videoId: string, options?: { eager?: boolean }) {
    const img = createYoutubeThumbnailImage(videoId);
    if (!isHtmlElement(img)) return;
    if (options?.eager && img.dataset.src) img.src = img.dataset.src;
    thumbDiv.replaceChildren(img);
}

/**
 * サムネイルを即時読み込みすべき可視領域内か判定する。
 * @param {HTMLElement} thumbDiv
 * @returns {boolean}
 */
export function shouldLoadYoutubeThumbnailNow(thumbDiv: HTMLElement) {
    const rect = thumbDiv.getBoundingClientRect();
    const viewHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.bottom > 0 && rect.top < viewHeight;
}

/**
 * サムネイル要素の再生状態クラスを更新する。
 * @param {HTMLElement} thumbDiv
 * @param {string} state
 */
export function setYoutubeThumbnailPlaybackState(thumbDiv: HTMLElement, state: string) {
    thumbDiv.classList.remove("playing");
    if (state === "playing") {
        thumbDiv.classList.add("playing");
    }
}

/**
 * サムネイル/プレイヤー枠の向きをデータ属性へ反映する。
 * @param {HTMLElement} thumbDiv
 * @param {string} orientation
 */
export function setYoutubeThumbnailOrientation(thumbDiv: HTMLElement, orientation: string) {
    thumbDiv.dataset.videoOrientation = orientation === "vertical" ? "vertical" : "landscape";
}

/**
 * 縦再生で前面表示が必要なカード状態を切り替える。
 * @param {unknown} thumbDiv
 * @param {boolean} isExpanded
 */
export function setYoutubeThumbnailExpandedCardState(thumbDiv: unknown, isExpanded: boolean) {
    const card = isHtmlElement(thumbDiv) ? thumbDiv.closest(".song-card") : null;
    if (!isHtmlElement(card)) return;
    card.classList.toggle("song-card-expanded", Boolean(isExpanded));
}

/**
 * サムネイルに対応する曲キーを返す。
 * @param {unknown} thumbDiv
 * @returns {string}
 */
export function getSongKeyFromYoutubeThumb(thumbDiv: unknown) {
    const card = isHtmlElement(thumbDiv) ? thumbDiv.closest(".song-card") : null;
    return isHtmlElement(card) ? (card.dataset.songKey || "") : "";
}

/**
 * 再生開始したカードが見切れている場合は見える位置まで寄せる。
 * @param {unknown} thumbDiv
 */
export function revealYoutubePlaybackCardIfNeeded(thumbDiv: unknown) {
    const card = isHtmlElement(thumbDiv) ? thumbDiv.closest(".song-card") : null;
    if (!isHtmlElement(card)) return;
    scheduleScrollElementIntoView(card, {
        topOffset: getHeaderHeight(),
        behavior: "smooth"
    });
}
