import type { AppUiState } from "../../state.types";

type AutoHideHeaderControllerInput = {
    ui: Pick<AppUiState, "el">;
    isSidebarOpen?: () => boolean;
    scrollDeltaPx?: number;
};

type ScrollDirection = -1 | 0 | 1;

const DEFAULT_SCROLL_DELTA_PX = 16;

/**
 * ページスクロール方向に応じてヘッダーを退避・再表示する controller を作成する。
 */
export function createAutoHideHeaderController(input: AutoHideHeaderControllerInput) {
    const { ui } = input;
    const isSidebarOpen = input.isSidebarOpen || (() => false);
    const scrollDeltaPx = Number.isFinite(input.scrollDeltaPx) && Number(input.scrollDeltaPx) > 0
        ? Number(input.scrollDeltaPx)
        : DEFAULT_SCROLL_DELTA_PX;
    let lastScrollY = 0;
    let directionStartY = 0;
    let scrollDirection: ScrollDirection = 0;
    let topVisibilityBoundary = 0;
    let isScrollUpdateScheduled = false;
    let isSetup = false;

    /**
     * 初期化済みのヘッダー要素を返す。
     * @returns {HTMLElement | null}
     */
    function getHeader(): HTMLElement | null {
        const header = ui.el.header;
        return header instanceof HTMLElement ? header : null;
    }

    /**
     * overscroll の負値を除いた現在のページスクロール位置を返す。
     * @returns {number}
     */
    function getPageScrollY(): number {
        if (Number.isFinite(window.scrollY)) return Math.max(0, window.scrollY);
        const scrollTop = document.scrollingElement?.scrollTop;
        return Number.isFinite(scrollTop) ? Math.max(0, Number(scrollTop)) : 0;
    }

    /**
     * ヘッダーの退避状態を更新する。
     * @param {boolean} isHidden
     */
    function setHeaderHidden(isHidden: boolean): void {
        const header = getHeader();
        if (!header) return;
        header.classList.toggle("is-auto-hidden", isHidden);
    }

    /**
     * 指定位置を起点としてスクロール方向と移動量の計測をやり直す。
     * @param {number} scrollY
     */
    function resetScrollTracking(scrollY: number): void {
        lastScrollY = scrollY;
        directionStartY = scrollY;
        scrollDirection = 0;
    }

    /**
     * ヘッダーを表示し、次の方向判定を現在位置から開始する。
     * @param {number} scrollY
     */
    function showHeaderFrom(scrollY: number): void {
        setHeaderHidden(false);
        resetScrollTracking(scrollY);
    }

    /**
     * ヘッダー内で現在フォーカス可視になっている要素があるか判定する。
     * @returns {boolean}
     */
    function hasFocusVisibleHeaderElement(): boolean {
        const header = getHeader();
        const activeElement = document.activeElement;
        return Boolean(
            header
            && activeElement instanceof Element
            && header.contains(activeElement)
            && activeElement.matches(":focus-visible")
        );
    }

    /**
     * 現在位置と直前からの移動方向に応じてヘッダー表示を同期する。
     */
    function syncHeaderForScroll(): void {
        isScrollUpdateScheduled = false;
        const scrollY = getPageScrollY();
        if (isSidebarOpen() || hasFocusVisibleHeaderElement() || scrollY <= topVisibilityBoundary) {
            showHeaderFrom(scrollY);
            return;
        }
        if (scrollY === lastScrollY) return;

        const nextDirection: ScrollDirection = scrollY > lastScrollY ? 1 : -1;
        if (nextDirection !== scrollDirection) {
            scrollDirection = nextDirection;
            directionStartY = lastScrollY;
        }
        lastScrollY = scrollY;
        if (Math.abs(scrollY - directionStartY) < scrollDeltaPx) return;

        setHeaderHidden(nextDirection === 1);
        resetScrollTracking(scrollY);
    }

    /**
     * 同一フレーム内の scroll イベントをまとめて表示判定する。
     */
    function scheduleScrollSync(): void {
        if (isScrollUpdateScheduled) return;
        isScrollUpdateScheduled = true;
        requestAnimationFrame(syncHeaderForScroll);
    }

    /**
     * ヘッダー内へフォーカスが入ったとき、次の描画前にヘッダーを表示する。
     */
    function handleHeaderFocusIn(): void {
        showHeaderFrom(getPageScrollY());
    }

    /**
     * ヘッダー外へフォーカスが移ったら方向判定を現在位置から再開する。
     * @param {FocusEvent} event
     */
    function handleHeaderFocusOut(event: FocusEvent): void {
        const header = getHeader();
        if (header && event.relatedTarget instanceof Element && header.contains(event.relatedTarget)) return;
        resetScrollTracking(getPageScrollY());
    }

    /**
     * 通常再読込や bfcache 復帰で復元された位置でもヘッダーを最初は表示する。
     */
    function handlePageShow(): void {
        showHeaderFrom(getPageScrollY());
    }

    /**
     * ヘッダー高と初期位置を記録し、ページ操作の監視を開始する。
     */
    function setup(): void {
        if (isSetup) return;
        const header = getHeader();
        if (!header) return;
        isSetup = true;
        topVisibilityBoundary = Math.max(0, header.getBoundingClientRect().height);
        showHeaderFrom(getPageScrollY());
        window.addEventListener("scroll", scheduleScrollSync, { passive: true });
        window.addEventListener("pageshow", handlePageShow);
        header.addEventListener("focusin", handleHeaderFocusIn);
        header.addEventListener("focusout", handleHeaderFocusOut);
    }

    /**
     * サイドバーの開閉通知を受けてヘッダーを表示し、方向判定をやり直す。
     * 開閉状態そのものは入力された getter から参照する。
     */
    function handleSidebarOpenChange(): void {
        showHeaderFrom(getPageScrollY());
    }

    return {
        setup,
        handleSidebarOpenChange
    };
}
