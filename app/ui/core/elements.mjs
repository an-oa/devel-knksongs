/**
 * 初期化時に利用する DOM 要素参照をまとめて取得する。
 * @returns {Record<string, HTMLElement | null>}
 */
export function collectUiElements() {
    const sidebar = document.getElementById("sidebar");
    return {
        sidebar,
        sidebarHeader: sidebar ? sidebar.querySelector(".sidebar-header") : null,
        sidebarScrollArea: sidebar ? sidebar.querySelector(".sidebar-scroll-area") : null,
        resultList: document.getElementById("resultList"),
        resultCount: document.getElementById("resultCount"),
        loadMoreContainer: document.getElementById("loadMoreContainer"),
        searchBox: document.getElementById("searchBox"),
        relayOnly: document.getElementById("relayOnly"),
        harmonyOnly: document.getElementById("harmonyOnly"),
        dateFromYear: document.getElementById("dateFromYear"),
        dateFromMonth: document.getElementById("dateFromMonth"),
        dateFromDay: document.getElementById("dateFromDay"),
        dateToYear: document.getElementById("dateToYear"),
        dateToMonth: document.getElementById("dateToMonth"),
        dateToDay: document.getElementById("dateToDay"),
        clearDateFromBtn: document.getElementById("clearDateFromBtn"),
        clearDateToBtn: document.getElementById("clearDateToBtn"),
        themeToggle: document.getElementById("theme-toggle"),
        thumbToggle: document.getElementById("thumbnail-toggle"),
        endTimeToggle: document.getElementById("end-time-toggle"),
        continuousPlaybackToggle: document.getElementById("continuous-playback-toggle"),
        loopPlaybackToggle: document.getElementById("loop-playback-toggle"),
        playbackSettingsGroup: document.getElementById("playback-settings-group"),
        openSettingsPanelBtn: document.getElementById("open-settings-panel"),
        settingsSidebarPanel: document.getElementById("settings-sidebar-panel"),
        closeSettingsPanelBtn: document.getElementById("close-settings-panel"),
        closeSettingsSidebarBtn: document.getElementById("close-settings-sidebar"),
        formatsList: document.getElementById("formatsList"),
        frameScopeOptions: document.getElementById("frameScopeOptions"),
        openBookmarkPanelBtn: document.getElementById("open-bookmark-panel"),
        bookmarkSidebarPanel: document.getElementById("bookmark-sidebar-panel"),
        closeBookmarkPanelBtn: document.getElementById("close-bookmark-panel"),
        closeBookmarkSidebarBtn: document.getElementById("close-bookmark-sidebar"),
        bookmarkPanelCreate: document.getElementById("bookmark-panel-create"),
        bookmarkPanelNewName: document.getElementById("bookmark-panel-new-name"),
        bookmarkPanelError: document.getElementById("bookmark-panel-error"),
        bookmarkPanelCreateBtn: document.getElementById("bookmark-panel-create-btn"),
        bookmarkPanelExportBtn: document.getElementById("bookmark-panel-export-btn"),
        bookmarkPanelImportBtn: document.getElementById("bookmark-panel-import-btn"),
        bookmarkPanelImportInput: document.getElementById("bookmark-panel-import-input"),
        bookmarkList: document.getElementById("bookmark-list")
    };
}

/**
 * 保存値またはシステム設定からテーマを適用する。
 * @param {{ ui: { el: Record<string, HTMLElement | null> } }} input
 */
export function applyThemeFromStorage({ ui }) {
    const themeToggle = ui.el.themeToggle;
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDarkMode = savedTheme ? savedTheme === "dark" : systemPrefersDark;
    document.documentElement.classList.toggle("dark-theme", isDarkMode);
    if (themeToggle) themeToggle.checked = isDarkMode;
}

/**
 * テーマ状態を初期化し、トグル変更を保存する。
 * @param {{ ui: { el: Record<string, HTMLElement | null> } }} input
 */
export function setupTheme({ ui }) {
    const themeToggle = ui.el.themeToggle;
    applyThemeFromStorage({ ui });
    if (!themeToggle) return;
    themeToggle.addEventListener("change", () => {
        const isDarkNow = themeToggle.checked;
        document.documentElement.classList.toggle("dark-theme", isDarkNow);
        localStorage.setItem("theme", isDarkNow ? "dark" : "light");
    });
}
