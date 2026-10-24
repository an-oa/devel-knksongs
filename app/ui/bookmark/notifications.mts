import { getSongDisplayTitle } from "../../lib/song-display-name.mjs";
import { getBookmarkText } from "./text.mjs";
import { resolveSongRef } from "../../lib/song-lookup.mjs";
import type { AppDataState, AppUiState } from "../../state.types";

export const BOOKMARK_NOTIFICATION_TIMEOUT_MS = 4000;

/**
 * timeout handle が Node 互換の unref を持つ場合だけ解放する。
 * @param {ReturnType<typeof setTimeout>} timerId
 */
function unrefTimer(timerId: ReturnType<typeof setTimeout>): void {
    const timerHandle = timerId as { unref?: () => void };
    if (typeof timerHandle.unref === "function") {
        timerHandle.unref();
    }
}

/**
 * toast 要素を popover と DOM から取り除く。
 * @param {HTMLElement | null} toast
 */
function removeToastElement(toast: HTMLElement | null): void {
    if (!toast) return;
    if (typeof toast.hidePopover === "function") {
        try {
            toast.hidePopover();
        } catch {
            // すでに閉じている popover は、そのまま DOM から取り除く。
        }
    }
    if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
    }
}

/**
 * ブックマーク操作の通知表示を管理するコントローラーを作成する。
 */
export function createBookmarkNotificationController({
    data,
    ui,
    timeoutMs = BOOKMARK_NOTIFICATION_TIMEOUT_MS
}: {
    data: Pick<AppDataState, "allSongsRaw">;
    ui: Pick<AppUiState, "lookup" | "language"> & {
        el: Pick<AppUiState["el"], "bookmarkNotificationRegion">;
    };
    timeoutMs?: number;
}) {
    const lookupUi = ui.lookup;
    let currentToast: HTMLElement | null = null;
    let currentTimerId: ReturnType<typeof setTimeout> | null = null;
    let nextToastSequence = 0;

    /**
     * 自動消去 timer を解除する。
     */
    function clearNotificationTimer(): void {
        if (currentTimerId === null) return;
        clearTimeout(currentTimerId);
        currentTimerId = null;
    }

    /**
     * 表示中のブックマーク通知を消す。
     */
    function dismissBookmarkNotification(): void {
        clearNotificationTimer();
        removeToastElement(currentToast);
        currentToast = null;
    }

    /**
     * ブックマーク操作の成功を toast と polite live region で通知する。
     * @param {string} message
     */
    function showBookmarkNotification(message: string): void {
        const region = ui.el.bookmarkNotificationRegion;
        if (!region || !message) return;

        dismissBookmarkNotification();
        region.replaceChildren();

        const toast = document.createElement("div");
        const toastId = `bookmark-toast-${Date.now()}-${++nextToastSequence}`;
        toast.id = toastId;
        toast.className = "bookmark-toast";
        toast.setAttribute("popover", "manual");

        const messageEl = document.createElement("span");
        messageEl.className = "bookmark-toast-message";
        messageEl.textContent = message;

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "bookmark-toast-close";
        closeBtn.setAttribute("aria-label", getBookmarkText(ui.language.current).closeNotification);
        closeBtn.setAttribute("popovertarget", toastId);
        closeBtn.setAttribute("popovertargetaction", "hide");
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", dismissBookmarkNotification);

        toast.append(messageEl, closeBtn);
        region.appendChild(toast);
        currentToast = toast;

        if (typeof toast.showPopover === "function") {
            try {
                toast.showPopover();
            } catch {
                // Popover 非対応相当の状態では通常要素として表示する。
            }
        }

        currentTimerId = setTimeout(dismissBookmarkNotification, timeoutMs);
        unrefTimer(currentTimerId);
    }

    /**
     * ブックマーク保存用の曲参照から、通知に表示する曲名を設定中の表記で返す。
     * @param songRef ブックマーク保存用の曲参照
     * @returns 通知に表示する曲名
     */
    function getSongTitleForNotification(songRef: string | null | undefined): string {
        const song = resolveSongRef(lookupUi, data.allSongsRaw, songRef);
        const title = song ? getSongDisplayTitle(song, ui.language.current).text.trim() : "";
        return title || getBookmarkText(ui.language.current).unknownSong;
    }

    /**
     * ブックマーク作成の成功をユーザーへ通知する。
     * @param {string} bookmarkName
     */
    function notifyBookmarkCreated(bookmarkName: string): void {
        showBookmarkNotification(getBookmarkText(ui.language.current).created(bookmarkName));
    }

    /**
     * ブックマーク削除の成功をユーザーへ通知する。
     * @param {string} bookmarkName
     */
    function notifyBookmarkDeleted(bookmarkName: string): void {
        showBookmarkNotification(getBookmarkText(ui.language.current).deleted(bookmarkName));
    }

    /**
     * カードをブックマークへ保存した成功をユーザーへ通知する。
     * @param {string} bookmarkName
     * @param {string | null | undefined} songRef
     * @param {{ createdBookmark?: boolean }} [options]
     */
    function notifySongSavedToBookmark(
        bookmarkName: string,
        songRef: string | null | undefined,
        options?: { createdBookmark?: boolean }
    ): void {
        const songTitle = getSongTitleForNotification(songRef);
        if (options && options.createdBookmark) {
            showBookmarkNotification(getBookmarkText(ui.language.current).createdAndSaved(bookmarkName, songTitle));
            return;
        }
        showBookmarkNotification(getBookmarkText(ui.language.current).saved(bookmarkName, songTitle));
    }

    /**
     * カードをブックマークから削除した成功をユーザーへ通知する。
     * @param {string} bookmarkName
     * @param {string | null | undefined} songRef
     */
    function notifySongRemovedFromBookmark(
        bookmarkName: string,
        songRef: string | null | undefined
    ): void {
        const songTitle = getSongTitleForNotification(songRef);
        showBookmarkNotification(getBookmarkText(ui.language.current).removed(bookmarkName, songTitle));
    }

    return {
        dismissBookmarkNotification,
        notifyBookmarkCreated,
        notifyBookmarkDeleted,
        notifySongSavedToBookmark,
        notifySongRemovedFromBookmark
    };
}
