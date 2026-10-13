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
 * サムネイル画像要素を生成する。
 * 読み込みはブラウザ標準の遅延読み込みに任せ、画面に近づいてから取得させる。
 * @param videoId サムネイルを表示する YouTube 動画 ID
 * @returns サムネイル画像。DOM を使えない環境では null
 */
export function createYoutubeThumbnailImage(videoId: string) {
    if (!canUseDom()) return null;
    const img = document.createElement("img");
    // src より先に指定し、生成した時点で読み込みが始まらないようにする。
    img.loading = "lazy";
    img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    suppressYoutubeThumbnailImageSaveActions(img);
    return img;
}

/**
 * サムネイル画像をコンテナへ適用する。
 * @param thumbDiv 画像を置くサムネイル要素
 * @param videoId サムネイルを表示する YouTube 動画 ID
 */
export function applyYoutubeThumbnailImage(thumbDiv: HTMLElement, videoId: string) {
    const img = createYoutubeThumbnailImage(videoId);
    if (!isHtmlElement(img)) return;
    thumbDiv.replaceChildren(img);
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
