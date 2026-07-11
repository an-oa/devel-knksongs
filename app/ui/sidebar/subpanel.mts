type SidebarSubpanelReturnFocusState = {
    returnFocusEl: HTMLElement | null;
};

type SidebarSubpanelControllerInput = {
    getPanel: () => HTMLElement | null | undefined;
    getSidebar: () => HTMLElement | null | undefined;
    getBackgroundElements: () => Array<Element | null | undefined>;
    getOpener: () => HTMLElement | null | undefined;
    state: SidebarSubpanelReturnFocusState;
};

type SidebarSubpanelOpenOptions = {
    returnFocusEl?: Element | null | undefined;
    focusEl?: HTMLElement | null | undefined;
};

type SidebarSubpanelCloseOptions = {
    restoreFocus?: boolean;
};

/**
 * サイドバー内サブパネルの表示、背面 inert、フォーカス復帰をまとめて扱う controller を作成する。
 * @param {SidebarSubpanelControllerInput} input
 */
export function createSidebarSubpanelController({
    getPanel,
    getSidebar,
    getBackgroundElements,
    getOpener,
    state
}: SidebarSubpanelControllerInput) {
    /**
     * サブパネルを表示し、必要に応じて初期フォーカスを移す。
     * @param {SidebarSubpanelOpenOptions | undefined} options
     */
    function open(options?: SidebarSubpanelOpenOptions): void {
        state.returnFocusEl = options?.returnFocusEl instanceof HTMLElement
            ? options.returnFocusEl
            : null;
        setBackgroundInert(true);
        const panel = getPanel();
        if (panel) {
            panel.hidden = false;
            panel.setAttribute("aria-hidden", "false");
        }
        if (options?.focusEl) {
            options.focusEl.focus();
        }
    }

    /**
     * サブパネルを隠し、指定された場合は元の操作元へフォーカスを戻す。
     * @param {SidebarSubpanelCloseOptions | undefined} options
     */
    function close(options?: SidebarSubpanelCloseOptions): void {
        const shouldRestoreFocus = Boolean(options?.restoreFocus);
        const returnFocusEl = state.returnFocusEl;
        state.returnFocusEl = null;
        const panel = getPanel();
        if (panel) {
            blurPanelActiveElement(panel);
            panel.hidden = true;
            panel.setAttribute("aria-hidden", "true");
        }
        setBackgroundInert(false);
        if (!shouldRestoreFocus) return;
        restoreFocus(returnFocusEl);
    }

    /**
     * サブパネル表示中のみ、背面のサイドバー要素をフォーカス対象外にする。
     * @param {boolean} isInert
     */
    function setBackgroundInert(isInert: boolean): void {
        getBackgroundElements().forEach((element) => {
            if (!element) return;
            if (isInert) {
                element.setAttribute("inert", "");
                element.setAttribute("aria-hidden", "true");
                return;
            }
            element.removeAttribute("inert");
            element.removeAttribute("aria-hidden");
        });
    }

    /**
     * パネルを隠す前に、内部に残っているフォーカスを外す。
     * @param {HTMLElement} targetPanel
     */
    function blurPanelActiveElement(targetPanel: HTMLElement): void {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return;
        if (!targetPanel.contains(active)) return;
        if (typeof active.blur === "function") {
            active.blur();
        }
    }

    /**
     * 戻り先がサイドバー内に残っていれば戻し、無効な場合は opener へ戻す。
     * @param {HTMLElement | null} returnFocusEl
     */
    function restoreFocus(returnFocusEl: HTMLElement | null): void {
        const sidebar = getSidebar();
        if (
            returnFocusEl &&
            returnFocusEl.isConnected &&
            typeof returnFocusEl.focus === "function" &&
            sidebar &&
            sidebar.contains(returnFocusEl)
        ) {
            returnFocusEl.focus();
            return;
        }
        const opener = getOpener();
        if (opener && typeof opener.focus === "function") {
            opener.focus();
        }
    }

    return {
        open,
        close
    };
}
