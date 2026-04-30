import { isHtmlElement } from "../dom-utils.mjs?v=16";

export const DEFAULT_MASONRY_GAP_PX = 12;

export const DEFAULT_MASONRY_BREAKPOINTS = [
    { minWidth: 1400, columns: 4 },
    { minWidth: 1000, columns: 3 },
    { minWidth: 600, columns: 2 }
];

/**
 * コンテナ幅に対応する masonry の列数を返す。
 * @param {number} containerWidth
 * @param {Array<{ minWidth: number, columns: number }>} breakpoints
 * @returns {number}
 */
export function getMasonryColumnCount(containerWidth, breakpoints = DEFAULT_MASONRY_BREAKPOINTS) {
    for (const rule of breakpoints) {
        if (containerWidth >= rule.minWidth) return rule.columns;
    }
    return 1;
}

/**
 * DOM順を列固定で保ちつつカードを絶対配置する。
 * @param {*} container
 * @param {{ gapPx?: number, breakpoints?: Array<{ minWidth: number, columns: number }> } | undefined} options
 */
export function applyMasonryLayout(container, options) {
    if (!isHtmlElement(container)) return;
    const settings = options || {};
    const gapPx = Number.isFinite(settings.gapPx) ? settings.gapPx : DEFAULT_MASONRY_GAP_PX;
    const breakpoints = Array.isArray(settings.breakpoints)
        ? settings.breakpoints
        : DEFAULT_MASONRY_BREAKPOINTS;
    const cards = Array.from(container.children).filter((node) => (
        isHtmlElement(node) &&
        node.classList.contains("song-card")
    ));
    if (cards.length === 0) {
        container.style.height = "";
        return;
    }
    const containerRect = container.getBoundingClientRect();
    const containerWidth = container.clientWidth || containerRect.width || 0;
    if (containerWidth <= 0) return;
    const columnCount = getMasonryColumnCount(containerWidth, breakpoints);
    const totalGap = gapPx * (columnCount - 1);
    const columnWidth = Math.max(0, (containerWidth - totalGap) / columnCount);
    const columnHeights = Array.from({ length: columnCount }, () => 0);
    for (const node of cards) {
        node.style.width = `${columnWidth}px`;
        node.style.left = "0px";
        node.style.top = "0px";
        node.style.transform = "translate(0px, 0px)";
    }
    for (let index = 0; index < cards.length; index++) {
        const node = cards[index];
        const contentHeight = Number.isFinite(node.scrollHeight) && node.scrollHeight > 0
            ? node.scrollHeight
            : node.getBoundingClientRect().height;
        const columnIndex = index % columnCount;
        const top = columnHeights[columnIndex];
        const left = (columnWidth + gapPx) * columnIndex;
        node.style.left = `${left}px`;
        node.style.top = `${top}px`;
        node.style.transform = "none";
        node.dataset.layoutColumn = String(columnIndex);
        columnHeights[columnIndex] = top + contentHeight + gapPx;
    }
    const tallest = Math.max(...columnHeights);
    container.style.height = `${Math.max(0, tallest - gapPx)}px`;
}
