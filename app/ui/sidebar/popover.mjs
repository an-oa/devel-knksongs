/**
 * サイドバーの native Popover API と fallback 表示状態を管理する。
 * @param {{
 *   sidebar: HTMLElement | null,
 *   sidebarSheet: HTMLElement | null,
 *   mainContent: HTMLElement | null,
 *   openButton: HTMLElement | null,
 *   hideDelayMs?: number
 * }} input
 * @returns {{
 *   show: () => boolean,
 *   scheduleHideAfterClose: () => void,
 *   clearPendingHide: () => void,
 *   setMainContentInert: (isInert: boolean) => void,
 *   syncExpandedState: (isExpanded: boolean) => void
 * }}
 */
export function createSidebarPopoverController(input) {
    const {
        sidebar,
        sidebarSheet,
        mainContent,
        openButton,
        hideDelayMs = 350
    } = input;
    let hidePopoverTimer = 0;

    /**
     * サイドバーで native Popover API を利用できるか判定する。
     * @returns {boolean}
     */
    function canUsePopover() {
        return Boolean(
            sidebar &&
            typeof sidebar.showPopover === "function" &&
            typeof sidebar.hidePopover === "function"
        );
    }

    /**
     * 予約済みの Popover 非表示処理を取り消す。
     */
    function clearPendingHide() {
        if (!hidePopoverTimer) return;
        clearTimeout(hidePopoverTimer);
        hidePopoverTimer = 0;
    }

    /**
     * サイドバーを top layer へ昇格する。
     * @returns {boolean}
     */
    function show() {
        clearPendingHide();
        if (!sidebar || !canUsePopover()) return false;
        try {
            if (typeof sidebar.matches === "function" && sidebar.matches(":popover-open")) {
                return true;
            }
            sidebar.showPopover();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * サイドバーを top layer から外す。
     */
    function hidePopover() {
        if (!sidebar || !canUsePopover()) return;
        try {
            if (typeof sidebar.matches === "function" && !sidebar.matches(":popover-open")) return;
            sidebar.hidePopover();
        } catch {
            // showPopover/hidePopover can throw when the browser has already changed state.
        }
    }

    /**
     * 閉じた後のトランジション完了を待って Popover を非表示にする。
     */
    function scheduleHideAfterClose() {
        if (!sidebar || !canUsePopover()) return;
        clearPendingHide();
        if (!(sidebarSheet instanceof HTMLElement)) {
            hidePopover();
            return;
        }
        const hideIfClosed = () => {
            hidePopoverTimer = 0;
            if (sidebar.classList.contains("active")) return;
            hidePopover();
        };
        const removeTransitionListener = () => {
            if (typeof sidebarSheet.removeEventListener === "function") {
                sidebarSheet.removeEventListener("transitionend", onTransitionEnd);
            }
        };
        const onTransitionEnd = (event) => {
            if (event.target !== sidebarSheet || event.propertyName !== "transform") return;
            removeTransitionListener();
            clearPendingHide();
            hideIfClosed();
        };
        if (typeof sidebarSheet.addEventListener === "function") {
            sidebarSheet.addEventListener("transitionend", onTransitionEnd);
        }
        hidePopoverTimer = setTimeout(() => {
            removeTransitionListener();
            hideIfClosed();
        }, hideDelayMs);
    }

    /**
     * 背面の main コンテンツをフォーカス・支援技術対象外にする。
     * @param {boolean} isInert
     */
    function setMainContentInert(isInert) {
        if (!(mainContent instanceof HTMLElement)) return;
        if (isInert) {
            mainContent.setAttribute("inert", "");
            return;
        }
        mainContent.removeAttribute("inert");
    }

    /**
     * サイドバーと開閉ボタンのARIA状態を同期する。
     * @param {boolean} isExpanded
     */
    function syncExpandedState(isExpanded) {
        if (sidebar) sidebar.setAttribute("aria-hidden", isExpanded ? "false" : "true");
        if (openButton) openButton.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    }

    return {
        show,
        scheduleHideAfterClose,
        clearPendingHide,
        setMainContentInert,
        syncExpandedState
    };
}
