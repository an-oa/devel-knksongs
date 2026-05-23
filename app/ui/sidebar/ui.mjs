import { getSettingsPanelUiState } from "../../lib/ui-slices.mjs?v=23";
import { getSearchBooleanFilterElements } from "../../lib/search-boolean-filters.mjs?v=23";
import { createSidebarPopoverController } from "./popover.mjs?v=23";

/**
 * サイドバー関連の UI 操作をまとめるコントローラーを作成する。
 * @param {{
 *   data: { displayLimit: number },
 *   ui: { el: Record<string, HTMLElement | null>, settingsPanelReturnFocusEl: HTMLElement | null },
 *   constants: { resultDisplayBatchSize: number },
 *   callbacks: {
 *     getBookmarkUiController: () => {
 *       closeBookmarkModal: (options?: { restoreFocus?: boolean }) => void,
 *       openBookmarkBrowser: (options?: { returnFocusEl?: HTMLElement | null }) => void,
 *       setupBookmarkHandlers: () => void,
 *       openBookmarkModal: (songKey: string, options?: { returnFocusEl?: HTMLElement | null, closeSidebarOnExit?: boolean }) => void,
 *       removeSongFromActiveBookmark: (songKey: string) => void,
 *       clearActiveBookmark: (options?: { skipSearch?: boolean }) => void
 *     } | null,
 *     isIOSWebKit: () => boolean,
 *     markFilterTouched: (options?: { immediate?: boolean }) => void,
 *     markQueryTouched: () => void,
 *     clampDateInputsIfNeeded: () => void,
 *     syncDateSelectOptions: (kind?: string) => void,
 *     resetDateSelectGroup: (kind: string) => void,
 *     updateDisplay: () => void,
 *     clearSearch: () => void
 *   }
 * }} input
 */
export function createSidebarController(input) {
    const { data, ui, constants, callbacks } = input;
    const settingsPanelUi = getSettingsPanelUiState(ui);
    const { resultDisplayBatchSize } = constants;
    const {
        getBookmarkUiController,
        isIOSWebKit,
        markFilterTouched,
        markQueryTouched,
        clampDateInputsIfNeeded,
        syncDateSelectOptions,
        resetDateSelectGroup,
        updateDisplay,
        clearSearch
    } = callbacks;
    let closeSidebarMenu = null;

    /**
     * 表示設定パネルを開く。
     * @param {{ returnFocusEl?: HTMLElement | null } | undefined} options
     */
    function openSettingsPanel(options) {
        settingsPanelUi.returnFocusEl =
            options && options.returnFocusEl instanceof HTMLElement ? options.returnFocusEl : null;
        setSidebarBackgroundInert(true);
        if (ui.el.settingsSidebarPanel) {
            ui.el.settingsSidebarPanel.hidden = false;
            ui.el.settingsSidebarPanel.setAttribute("aria-hidden", "false");
        }
        if (ui.el.closeSettingsPanelBtn) {
            ui.el.closeSettingsPanelBtn.focus();
        }
    }

    /**
     * 表示設定パネルを閉じる。
     * @param {{ restoreFocus?: boolean } | undefined} options
     */
    function closeSettingsPanel(options) {
        const shouldRestoreFocus = Boolean(options && options.restoreFocus);
        const returnFocusEl = settingsPanelUi.returnFocusEl;
        settingsPanelUi.returnFocusEl = null;
        if (ui.el.settingsSidebarPanel) {
            blurPanelActiveElement(ui.el.settingsSidebarPanel);
            ui.el.settingsSidebarPanel.hidden = true;
            ui.el.settingsSidebarPanel.setAttribute("aria-hidden", "true");
        }
        setSidebarBackgroundInert(false);
        if (!shouldRestoreFocus) return;
        if (
            returnFocusEl &&
            returnFocusEl.isConnected &&
            typeof returnFocusEl.focus === "function" &&
            ui.el.sidebar &&
            ui.el.sidebar.contains(returnFocusEl)
        ) {
            returnFocusEl.focus();
            return;
        }
        if (ui.el.openSettingsPanelBtn && typeof ui.el.openSettingsPanelBtn.focus === "function") {
            ui.el.openSettingsPanelBtn.focus();
        }
    }

    /**
     * ブックマーク UI ハンドラーの初期化を委譲する。
     */
    function setupBookmarkHandlers() {
        const bookmarkUiController = getBookmarkUiController();
        if (!bookmarkUiController) return;
        bookmarkUiController.setupBookmarkHandlers();
    }

    /**
     * 曲追加用のブックマークモーダル表示を委譲する。
     * @param {string} songKey
     */
    function openBookmarkModal(songKey) {
        const bookmarkUiController = getBookmarkUiController();
        const sidebar = ui.el.sidebar;
        const openBtn = ui.el.openSidebarBtn;
        if (!bookmarkUiController || !sidebar || !openBtn) return;
        const returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const sidebarWasActive = sidebar.classList.contains("active");
        if (!sidebarWasActive) {
            openBtn.click();
        }
        bookmarkUiController.openBookmarkModal(songKey, {
            returnFocusEl,
            closeSidebarOnExit: !sidebarWasActive
        });
    }

    /**
     * アクティブブックマークからの曲削除を委譲する。
     * @param {string} songKey
     */
    function removeSongFromActiveBookmark(songKey) {
        const bookmarkUiController = getBookmarkUiController();
        if (!bookmarkUiController) return;
        bookmarkUiController.removeSongFromActiveBookmark(songKey);
    }

    /**
     * アクティブブックマーク解除処理を委譲する。
     * @param {{ skipSearch?: boolean } | undefined} options
     */
    function clearActiveBookmark(options) {
        const bookmarkUiController = getBookmarkUiController();
        if (!bookmarkUiController) return;
        bookmarkUiController.clearActiveBookmark(options);
    }

    /**
     * 検索 UI・サイドバー・日付入力・各種ボタンのイベントを設定する。
     */
    function setupUIHandlers() {
        const sidebar = ui.el.sidebar;
        const openBtn = ui.el.openSidebarBtn;
        const closeBtn = ui.el.closeSidebarBtn;
        const overlay = ui.el.sidebarOverlay;
        const loadMoreBtn = ui.el.loadMoreBtn;
        const clearBtn = ui.el.clearBtn;
        const dateFromYear = ui.el.dateFromYear;
        const dateFromMonth = ui.el.dateFromMonth;
        const dateFromDay = ui.el.dateFromDay;
        const dateToYear = ui.el.dateToYear;
        const dateToMonth = ui.el.dateToMonth;
        const dateToDay = ui.el.dateToDay;
        let lastFocusedElement = null;

        if (!sidebar || !openBtn || !closeBtn || !overlay || !loadMoreBtn || !clearBtn) return;
        const popoverController = createSidebarPopoverController({
            sidebar,
            sidebarSheet: ui.el.sidebarSheet,
            mainContent: ui.el.mainContent,
            openButton: openBtn
        });

        /**
         * サイドバーを開き、フォーカスとARIA状態を同期する。
         */
        function openSidebarMenu() {
            if (sidebar.classList.contains("active")) return;
            const bookmarkUiController = getBookmarkUiController();
            closeSettingsPanel({ restoreFocus: false });
            if (bookmarkUiController) {
                bookmarkUiController.closeBookmarkModal({ restoreFocus: false });
            }
            popoverController.clearPendingHide();
            const usesPopover = popoverController.show();
            sidebar.classList.add("active");
            if (!usesPopover) overlay.classList.add("show");
            lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            popoverController.setMainContentInert(true);
            popoverController.syncExpandedState(true);
            focusSidebarFirst();
        }

        openBtn.addEventListener("click", openSidebarMenu);

        closeSidebarMenu = () => {
            if (!sidebar.classList.contains("active")) return;
            const bookmarkUiController = getBookmarkUiController();
            closeSettingsPanel({ restoreFocus: false });
            if (bookmarkUiController) {
                bookmarkUiController.closeBookmarkModal({ restoreFocus: false });
            }
            blurSidebarActiveElement(sidebar);
            sidebar.classList.remove("active");
            overlay.classList.remove("show");
            popoverController.scheduleHideAfterClose();
            popoverController.setMainContentInert(false);
            popoverController.syncExpandedState(false);
            if (lastFocusedElement) {
                lastFocusedElement.focus();
                return;
            }
            openBtn.focus();
        };

        closeBtn.addEventListener("click", () => closeSidebarMenu());
        overlay.addEventListener("click", () => closeSidebarMenu());
        sidebar.addEventListener("click", (event) => {
            if (event.target === sidebar) closeSidebarMenu();
        });
        if (ui.el.openSettingsPanelBtn) {
            ui.el.openSettingsPanelBtn.addEventListener("click", () => {
                const bookmarkUiController = getBookmarkUiController();
                if (bookmarkUiController) {
                    bookmarkUiController.closeBookmarkModal({ restoreFocus: false });
                }
                openSettingsPanel({
                    returnFocusEl: ui.el.openSettingsPanelBtn
                });
            });
        }
        if (ui.el.closeSettingsPanelBtn) {
            ui.el.closeSettingsPanelBtn.addEventListener("click", () => {
                closeSettingsPanel({ restoreFocus: true });
            });
        }
        if (ui.el.closeSettingsSidebarBtn) {
            ui.el.closeSettingsSidebarBtn.addEventListener("click", () => closeSidebarMenu());
        }
        if (ui.el.openBookmarkPanelBtn) {
            ui.el.openBookmarkPanelBtn.addEventListener("click", () => {
                const bookmarkUiController = getBookmarkUiController();
                closeSettingsPanel({ restoreFocus: false });
                if (bookmarkUiController) {
                    bookmarkUiController.openBookmarkBrowser({
                        returnFocusEl: ui.el.openBookmarkPanelBtn
                    });
                }
            });
        }
        if (ui.el.closeBookmarkPanelBtn) {
            ui.el.closeBookmarkPanelBtn.addEventListener("click", () => {
                const bookmarkUiController = getBookmarkUiController();
                if (bookmarkUiController) {
                    bookmarkUiController.closeBookmarkModal({ restoreFocus: true });
                }
            });
        }
        if (ui.el.closeBookmarkSidebarBtn) {
            ui.el.closeBookmarkSidebarBtn.addEventListener("click", () => closeSidebarMenu());
        }
        document.addEventListener("keydown", (event) => {
            const bookmarkUiController = getBookmarkUiController();
            if (event.key === "Escape") {
                if (ui.el.settingsSidebarPanel && !ui.el.settingsSidebarPanel.hidden) {
                    event.preventDefault();
                    closeSettingsPanel({ restoreFocus: true });
                    return;
                }
                if (ui.el.bookmarkSidebarPanel && !ui.el.bookmarkSidebarPanel.hidden) {
                    event.preventDefault();
                    if (bookmarkUiController) {
                        bookmarkUiController.closeBookmarkModal({ restoreFocus: true });
                    }
                    return;
                }
                closeSidebarMenu();
            }
            if (event.key === "Tab") trapSidebarFocus(event, sidebar);
        });

        getSearchBooleanFilterElements(ui).forEach((checkbox) => {
            if (!checkbox) return;
            checkbox.addEventListener("change", () => {
                markFilterTouched();
            });
        });
        if (ui.el.searchBox) {
            ui.el.searchBox.addEventListener("input", () => {
                markQueryTouched();
            });
        }

        [dateFromYear, dateFromMonth, dateFromDay, dateToYear, dateToMonth, dateToDay].forEach((element) => {
            if (!element) return;
            element.addEventListener("change", () => {
                const isIOS = isIOSWebKit();
                const group = element.closest(".date-select-group");
                const isYearChange = element === dateFromYear || element === dateToYear;
                const isMonthChange = element === dateFromMonth || element === dateToMonth;
                if (isIOS && group && isYearChange) {
                    group.classList.add("is-updating");
                    const month = element === dateFromYear ? ui.el.dateFromMonth : ui.el.dateToMonth;
                    const day = element === dateFromYear ? ui.el.dateFromDay : ui.el.dateToDay;
                    if (month) month.value = "";
                    if (day) day.value = "";
                } else if (isIOS && group && isMonthChange) {
                    group.classList.add("is-updating");
                    const day = element === dateFromMonth ? ui.el.dateFromDay : ui.el.dateToDay;
                    if (day) day.value = "";
                } else {
                    moveDateFocusIfNeeded(element, dateFromYear, dateFromMonth, dateToYear, dateToMonth);
                }
                markFilterTouched({ immediate: true });
                clampDateInputsIfNeeded();
                syncDateSelectOptions();
                if (isIOS && group && (isYearChange || isMonthChange)) {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            group.classList.remove("is-updating");
                        });
                    });
                }
            });
            element.addEventListener("blur", clampDateInputsIfNeeded);
        });

        [ui.el.clearDateFromBtn, ui.el.clearDateToBtn].forEach((button, index) => {
            if (!button) return;
            button.addEventListener("click", () => {
                resetDateSelectGroup(index === 0 ? "from" : "to");
                markFilterTouched({ immediate: true });
            });
        });

        loadMoreBtn.addEventListener("click", () => {
            data.displayLimit += resultDisplayBatchSize;
            updateDisplay();
        });

        clearBtn.addEventListener("click", clearSearch);
        setupBookmarkHandlers();
    }

    /**
     * サブパネル表示中のみ、背面のサイドバー要素をフォーカス対象外にする。
     * @param {boolean} isInert
     */
    function setSidebarBackgroundInert(isInert) {
        [ui.el.sidebarHeader, ui.el.sidebarScrollArea].forEach((element) => {
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
     * 日付入力時に次のセレクトへフォーカス移動する。
     * @param {HTMLElement} target
     * @param {HTMLElement | null} fromYear
     * @param {HTMLElement | null} fromMonth
     * @param {HTMLElement | null} toYear
     * @param {HTMLElement | null} toMonth
     */
    function moveDateFocusIfNeeded(target, fromYear, fromMonth, toYear, toMonth) {
        if (fromYear && target === fromYear && fromMonth && fromYear.value) {
            fromMonth.focus();
            return;
        }
        if (fromMonth && target === fromMonth && fromMonth.value) {
            const fromDay = ui.el.dateFromDay;
            if (fromDay) {
                fromDay.focus();
                return;
            }
        }
        if (toYear && target === toYear && toMonth && toYear.value) {
            toMonth.focus();
            return;
        }
        if (toMonth && target === toMonth && toMonth.value) {
            const toDay = ui.el.dateToDay;
            if (toDay) {
                toDay.focus();
            }
        }
    }

    /**
     * サイドバー内の現在フォーカス要素を外す。
     * @param {HTMLElement} sidebar
     */
    function blurSidebarActiveElement(sidebar) {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return;
        if (!sidebar.contains(active)) return;
        if (typeof active.blur === "function") {
            active.blur();
        }
    }

    /**
     * サブパネルを隠す前に、内部に残っているフォーカスを外す。
     * @param {HTMLElement} panel
     */
    function blurPanelActiveElement(panel) {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return;
        if (!panel.contains(active)) return;
        if (typeof active.blur === "function") {
            active.blur();
        }
    }

    /**
     * サイドバー内でフォーカス可能な要素一覧を取得する。
     * @param {HTMLElement | null} sidebar
     * @returns {HTMLElement[]}
     */
    function getFocusableInSidebar(sidebar) {
        if (!sidebar) return [];
        const focusable = sidebar.querySelectorAll([
            "a[href]",
            "button:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            '[tabindex]:not([tabindex="-1"])'
        ].join(","));
        return Array.from(focusable).filter((element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (element.hasAttribute("inert") || element.hidden) return false;
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden";
        });
    }

    /**
     * サイドバー内の先頭フォーカス可能要素へフォーカスする。
     */
    function focusSidebarFirst() {
        const sidebar = ui.el.sidebar;
        const focusable = getFocusableInSidebar(sidebar);
        if (focusable.length > 0) {
            focusable[0].focus();
            return;
        }
        if (sidebar) {
            sidebar.setAttribute("tabindex", "-1");
            sidebar.focus();
        }
    }

    /**
     * 開いているサイドバー内で Tab フォーカスを循環させる。
     * @param {KeyboardEvent} event
     * @param {HTMLElement | null} sidebar
     */
    function trapSidebarFocus(event, sidebar) {
        if (!sidebar || !sidebar.classList.contains("active")) return;
        const focusable = getFocusableInSidebar(sidebar);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
            return;
        }
        if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    return {
        setupUIHandlers,
        openBookmarkModal,
        removeSongFromActiveBookmark,
        clearActiveBookmark,
        closeSidebarMenu: () => {
            if (typeof closeSidebarMenu === "function") {
                closeSidebarMenu();
            }
        }
    };
}
