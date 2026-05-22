import { getBookmarkPanelUiState } from "../../lib/ui-slices.mjs?v=22";
import {
    buildBookmarkExportFileName,
    buildBookmarkImportConfirmMessage,
    getBookmarkImportErrorMessage,
    readFileText,
    saveTextFile
} from "./import-export.mjs?v=22";

/**
 * ブックマークUIのイベント処理・描画・選択状態管理をまとめたコントローラーを作成する。
 * @param {*} data
 * @param {*} ui
 * @param {*} callbacks
 */
export function createBookmarkUiController({ data, ui, callbacks }) {
    const bookmarkPanelUi = getBookmarkPanelUiState(ui);
    const {
        clearSearchDebounce,
        scheduleSearch,
        onAddSongToBookmark,
        onCreateBookmark,
        onCreateBookmarkAndAdd,
        onDeleteBookmark,
        onRenameBookmark,
        onRemoveSongFromBookmark,
        onRequestCloseSidebar,
        onExportBookmarks,
        onPreviewBookmarkImport,
        onImportBookmarksText,
        saveTextFile: saveTextFileCallback = saveTextFile
    } = callbacks;

    /**
     * 各アクションの戻り値を `{ ok, reason }` 形式に正規化する。
     * @param {*} result
     */
    function normalizeActionResult(result) {
        if (result && typeof result === "object" && typeof result.ok === "boolean") {
            return result;
        }
        if (typeof result === "boolean") {
            return { ok: result, reason: result ? "" : "unknown" };
        }
        return { ok: false, reason: "unknown" };
    }

    /**
     * 上限エラー時に理由別のメッセージを表示し、通知したかどうかを返す。
     * @param {*} result
     */
    function notifyIfLimitError(result) {
        if (!result || result.ok) return false;
        const limit = Number.isFinite(result.limit) ? result.limit : null;
        if (result.reason === "max_bookmark_count") {
            if (limit === null) {
                alert("ブックマークの登録上限に達しています。不要なブックマークを削除してください。");
            } else {
                alert(`ブックマークは最大${limit}件までです。不要なブックマークを削除してください。`);
            }
            return true;
        }
        if (result.reason === "max_songs_per_bookmark") {
            if (limit === null) {
                alert("1つのブックマークに登録できる曲数の上限に達しています。");
            } else {
                alert(`1つのブックマークに登録できる曲は最大${limit}曲です。`);
            }
            return true;
        }
        return false;
    }

    /**
     * リネーム失敗時に理由別メッセージを表示し、通知したかどうかを返す。
     * @param {*} result
     * @returns {boolean}
     */
    function notifyIfRenameError(result) {
        if (!result || result.ok) return false;
        if (result.reason === "empty_name") {
            alert("ブックマーク名を入力してください。");
            return true;
        }
        if (result.reason === "max_bookmark_name_length") {
            const limit = Number.isFinite(result.limit) ? result.limit : null;
            alert(limit === null
                ? "ブックマーク名の文字数上限を超えています。"
                : `ブックマーク名は最大${limit}文字までです。`);
            return true;
        }
        if (result.reason === "bookmark_not_found") {
            alert("ブックマークが見つかりません。画面を更新して再度お試しください。");
            return true;
        }
        return false;
    }

    /**
     * 曲追加失敗時に理由別メッセージを表示し、通知したかどうかを返す。
     * @param {*} result
     * @returns {boolean}
     */
    function notifyIfAddSongError(result) {
        if (!result || result.ok) return false;
        if (notifyIfLimitError(result)) return true;
        if (result.reason === "duplicate_song") {
            alert("この曲はすでに選択したブックマークに追加されています。");
            return true;
        }
        if (result.reason === "bookmark_not_found") {
            alert("ブックマークが見つかりません。画面を更新して再度お試しください。");
            return true;
        }
        return false;
    }

    /**
     * ブックマークIDを作成日時順で取得する。
     */
    function getSortedBookmarkIds() {
        return Object.keys(data.bookmarks).sort((a, b) => {
            return (data.bookmarks[a].createdAt || 0) - (data.bookmarks[b].createdAt || 0);
        });
    }

    /**
     * 現在が「曲を追加するための選択モード」かどうかを返す。
     */
    function isAddingSongMode() {
        return Boolean(bookmarkPanelUi.pendingAction && bookmarkPanelUi.pendingAction.songKey);
    }

    /**
     * ブックマーク専用パネルを表示する。
     */
    function showBookmarkPanel() {
        setSidebarBackgroundInert(true);
        if (ui.el.bookmarkSidebarPanel) {
            ui.el.bookmarkSidebarPanel.hidden = false;
            ui.el.bookmarkSidebarPanel.setAttribute("aria-hidden", "false");
        }
    }

    /**
     * ブックマーク専用パネルを閉じる。
     */
    function hideBookmarkPanel() {
        if (ui.el.bookmarkSidebarPanel) {
            ui.el.bookmarkSidebarPanel.hidden = true;
            ui.el.bookmarkSidebarPanel.setAttribute("aria-hidden", "true");
        }
        setSidebarBackgroundInert(false);
    }

    /**
     * ブックマークパネル表示中のみ、背面のサイドバー要素をフォーカス対象外にする。
     * @param {boolean} isInert
     */
    function setSidebarBackgroundInert(isInert) {
        [ui.el.sidebarHeader, ui.el.sidebarScrollArea].forEach((el) => {
            if (!el) return;
            if (isInert) {
                el.setAttribute("inert", "");
                el.setAttribute("aria-hidden", "true");
                return;
            }
            el.removeAttribute("inert");
            el.removeAttribute("aria-hidden");
        });
    }

    /**
     * パネルを閉じたあとにフォーカスを戻す要素を保持する。
     * @param {*} returnFocusEl
     */
    function rememberBookmarkPanelReturnFocus(returnFocusEl) {
        bookmarkPanelUi.returnFocusEl = returnFocusEl instanceof HTMLElement ? returnFocusEl : null;
    }

    /**
     * パネルを閉じたあとにフォーカスを元の要素へ戻す。
     */
    function restoreBookmarkPanelFocus() {
        const returnFocusEl = bookmarkPanelUi.returnFocusEl;
        bookmarkPanelUi.returnFocusEl = null;
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
        if (ui.el.openBookmarkPanelBtn && typeof ui.el.openBookmarkPanelBtn.focus === "function") {
            ui.el.openBookmarkPanelBtn.focus();
        }
    }

    /**
     * 現在モードに応じて作成フォームの表示を更新する。
     */
    function syncBookmarkPanelMode() {
        const createWrap = ui.el.bookmarkPanelCreate;
        const nameInput = ui.el.bookmarkPanelNewName;
        const createBtn = ui.el.bookmarkPanelCreateBtn;
        if (!createWrap || !nameInput || !createBtn) return;

        createWrap.hidden = false;
        nameInput.placeholder = "新規ブックマーク名";
        createBtn.textContent = "作成";
    }

    /**
     * 空状態表示を生成する。
     * @param {string} message
     */
    function createEmptyBookmarkElement(message) {
        const empty = document.createElement("div");
        empty.className = "bookmark-empty-state";
        empty.textContent = message;
        return empty;
    }

    /**
     * 作成欄のインラインエラーを表示する。
     * @param {string} message
     */
    function showBookmarkPanelError(message) {
        const errorEl = ui.el.bookmarkPanelError;
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.hidden = !message;
    }

    /**
     * 作成欄のインラインエラーをクリアする。
     */
    function clearBookmarkPanelError() {
        showBookmarkPanelError("");
    }

    /**
     * ブックマークを JSON ファイルとしてエクスポートする。
     */
    async function exportBookmarksFromPanel() {
        if (typeof onExportBookmarks !== "function") return;
        clearBookmarkPanelError();
        try {
            const result = normalizeActionResult(onExportBookmarks());
            if (!result.ok || typeof result.text !== "string") {
                showBookmarkPanelError("ブックマークをエクスポートできませんでした。");
                return;
            }
            const fileName = typeof result.fileName === "string" && result.fileName.trim()
                ? result.fileName.trim()
                : buildBookmarkExportFileName(new Date());
            await saveTextFileCallback(result.text, fileName, "application/json");
        } catch (error) {
            if (error && error.name === "AbortError") return;
            showBookmarkPanelError("ブックマークをエクスポートできませんでした。");
        }
    }

    /**
     * ファイル選択ダイアログを開く。
     */
    function requestBookmarkImportFile() {
        const input = ui.el.bookmarkPanelImportInput;
        if (!input) return;
        clearBookmarkPanelError();
        input.value = "";
        input.click();
    }

    /**
     * 選択された JSON ファイルを読み込み、全置き換えでインポートする。
     */
    async function importBookmarksFromSelectedFile() {
        const input = ui.el.bookmarkPanelImportInput;
        const file = input && input.files && input.files[0] ? input.files[0] : null;
        if (!file || typeof onPreviewBookmarkImport !== "function" || typeof onImportBookmarksText !== "function") {
            return;
        }

        clearBookmarkPanelError();
        try {
            const text = await readFileText(file);
            const preview = normalizeActionResult(onPreviewBookmarkImport(text));
            if (!preview.ok) {
                showBookmarkPanelError(getBookmarkImportErrorMessage(preview));
                return;
            }
            if (!confirm(buildBookmarkImportConfirmMessage(preview))) return;

            const result = normalizeActionResult(onImportBookmarksText(text));
            if (!result.ok) {
                showBookmarkPanelError(getBookmarkImportErrorMessage(result));
                return;
            }
            alert(`ブックマークを${result.bookmarkCount || 0}件インポートしました。`);
        } catch {
            showBookmarkPanelError("ブックマークファイルを読み込めませんでした。");
        } finally {
            input.value = "";
        }
    }

    /**
     * ブックマークを追加モード/閲覧モードに応じて描画する。
     */
    function renderBookmarks() {
        const container = ui.el.bookmarkList;
        if (!container) return;

        syncBookmarkPanelMode();

        const sortedIds = getSortedBookmarkIds();
        if (sortedIds.length === 0) {
            container.replaceChildren(createEmptyBookmarkElement("ブックマークはまだありません。"));
            return;
        }

        const addingMode = isAddingSongMode();
        container.replaceChildren(...sortedIds.map((id) => {
            const bookmark = data.bookmarks[id];
            const item = document.createElement("div");
            item.className = "bookmark-item";
            item.dataset.bookmarkId = id;

            if (addingMode) {
                item.classList.add("bookmark-item-selecting");
                item.innerHTML = `
                    <span class="bookmark-item-name"></span>
                    <span class="bookmark-item-count">${bookmark.songs.length}</span>
                `;
            } else {
                item.innerHTML = `
                    <span class="bookmark-item-name"></span>
                    <span class="bookmark-item-count">${bookmark.songs.length}</span>
                    <button class="bookmark-rename-btn" aria-label="ブックマーク名を変更">変更</button>
                    <button class="bookmark-delete-btn" aria-label="ブックマークを削除"><span>&times;</span></button>
                `;
            }

            const nameEl = item.querySelector(".bookmark-item-name");
            nameEl.textContent = bookmark.name;
            nameEl.title = bookmark.name;

            if (!addingMode && data.activeBookmark === id) {
                item.classList.add("active");
            }

            item.addEventListener("click", (e) => {
                const target = e.target instanceof Element ? e.target : null;
                if (!target) return;

                if (addingMode) {
                    const result = normalizeActionResult(
                        onAddSongToBookmark(id, bookmarkPanelUi.pendingAction.songKey)
                    );
                    if (result.ok) {
                        closeBookmarkModal();
                        return;
                    }
                    notifyIfAddSongError(result);
                    return;
                }

                const renameBtn = target.closest(".bookmark-rename-btn");
                if (renameBtn) {
                    e.stopPropagation();
                    const newName = prompt("新しいブックマーク名を入力してください:", bookmark.name);
                    if (newName === null) return;
                    const result = normalizeActionResult(onRenameBookmark(id, newName));
                    notifyIfRenameError(result);
                    return;
                }

                const deleteBtn = target.closest(".bookmark-delete-btn");
                if (deleteBtn) {
                    e.stopPropagation();
                    if (confirm(`ブックマーク「${bookmark.name}」を削除しますか？`)) {
                        onDeleteBookmark(id);
                    }
                    return;
                }

                if (data.activeBookmark === id) {
                    clearActiveBookmark();
                } else {
                    setActiveBookmark(id);
                }
            });

            return item;
        }));
    }

    /**
     * 新規ブックマークを作成し、保留中の曲を追加する。
     */
    function createBookmarkFromPanel() {
        const nameInput = ui.el.bookmarkPanelNewName;
        if (!nameInput) return;

        const newName = nameInput.value.trim();
        if (!newName) {
            showBookmarkPanelError("ブックマーク名を入力してください。");
            nameInput.focus();
            return;
        }

        clearBookmarkPanelError();

        const result = isAddingSongMode()
            ? normalizeActionResult(onCreateBookmarkAndAdd(newName, bookmarkPanelUi.pendingAction.songKey))
            : normalizeActionResult(onCreateBookmark(newName));
        if (result.ok) {
            nameInput.value = "";
            clearBookmarkPanelError();
            if (isAddingSongMode()) {
                closeBookmarkModal();
            } else {
                renderBookmarks();
                nameInput.focus();
            }
            return;
        }
        if (result.reason === "empty_name") {
            showBookmarkPanelError("ブックマーク名を入力してください。");
            nameInput.focus();
            return;
        }
        if (result.reason === "max_bookmark_name_length") {
            const limit = Number.isFinite(result.limit) ? result.limit : null;
            showBookmarkPanelError(limit === null
                ? "ブックマーク名の文字数上限を超えています。"
                : `ブックマーク名は最大${limit}文字までです。`);
            nameInput.focus();
            return;
        }
        notifyIfLimitError(result);
    }

    /**
     * ブックマークパネルのイベントを登録する。
     */
    function setupBookmarkHandlers() {
        const createBtn = ui.el.bookmarkPanelCreateBtn;
        const nameInput = ui.el.bookmarkPanelNewName;
        const exportBtn = ui.el.bookmarkPanelExportBtn;
        const importBtn = ui.el.bookmarkPanelImportBtn;
        const importInput = ui.el.bookmarkPanelImportInput;
        if (createBtn) {
            createBtn.addEventListener("click", createBookmarkFromPanel);
        }
        if (nameInput) {
            nameInput.addEventListener("input", clearBookmarkPanelError);
            nameInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    createBookmarkFromPanel();
                }
            });
        }
        if (exportBtn) {
            exportBtn.addEventListener("click", exportBookmarksFromPanel);
        }
        if (importBtn) {
            importBtn.addEventListener("click", requestBookmarkImportFile);
        }
        if (importInput) {
            importInput.addEventListener("change", importBookmarksFromSelectedFile);
        }
    }

    /**
     * 閲覧モードでブックマークパネルを開く。
     */
    function openBookmarkBrowser(options) {
        bookmarkPanelUi.pendingAction = null;
        bookmarkPanelUi.exitClosesSidebar = false;
        rememberBookmarkPanelReturnFocus(options && options.returnFocusEl);
        clearBookmarkPanelError();
        renderBookmarks();
        showBookmarkPanel();
        if (ui.el.closeBookmarkPanelBtn) {
            ui.el.closeBookmarkPanelBtn.focus();
        }
    }

    /**
     * 指定した曲を追加するためのブックマーク選択パネルを開く。
     * @param {*} songKey
     */
    function openBookmarkModal(songKey, options) {
        bookmarkPanelUi.pendingAction = { songKey };
        bookmarkPanelUi.exitClosesSidebar = Boolean(options && options.closeSidebarOnExit);
        rememberBookmarkPanelReturnFocus(options && options.returnFocusEl);
        clearBookmarkPanelError();
        renderBookmarks();
        showBookmarkPanel();
        if (ui.el.bookmarkPanelNewName) {
            ui.el.bookmarkPanelNewName.focus();
        } else if (ui.el.closeBookmarkPanelBtn) {
            ui.el.closeBookmarkPanelBtn.focus();
        }
    }

    /**
     * ブックマーク追加モードを終了し、専用パネルを閉じる。
     */
    function closeBookmarkModal(options) {
        const shouldCloseSidebar =
            Boolean(options && options.restoreFocus) &&
            Boolean(bookmarkPanelUi.exitClosesSidebar);
        bookmarkPanelUi.pendingAction = null;
        bookmarkPanelUi.exitClosesSidebar = false;
        clearBookmarkPanelError();
        hideBookmarkPanel();
        renderBookmarks();
        if (shouldCloseSidebar) {
            bookmarkPanelUi.returnFocusEl = null;
            onRequestCloseSidebar();
            return;
        }
        if (options && options.restoreFocus) {
            restoreBookmarkPanelFocus();
            return;
        }
        bookmarkPanelUi.returnFocusEl = null;
    }

    /**
     * アクティブなブックマークを切り替えて検索を再実行する。
     * @param {*} bookmarkId
     */
    function setActiveBookmark(bookmarkId) {
        clearSearchDebounce();
        data.activeBookmark = bookmarkId;
        renderBookmarks();
        scheduleSearch({ immediate: true });
    }

    /**
     * アクティブなブックマークを解除し、必要に応じて検索を再実行する。
     * @param {*} options
     */
    function clearActiveBookmark(options) {
        if (!data.activeBookmark) return;
        data.activeBookmark = null;
        renderBookmarks();
        if (!(options && options.skipSearch)) {
            scheduleSearch({ immediate: true });
        }
    }

    /**
     * 現在アクティブなブックマークから指定曲を削除する。
     * @param {*} songKey
     */
    function removeSongFromActiveBookmark(songKey) {
        if (!data.activeBookmark) return;
        onRemoveSongFromBookmark(data.activeBookmark, songKey);
    }

    return {
        setupBookmarkHandlers,
        renderBookmarks,
        openBookmarkBrowser,
        openBookmarkModal,
        closeBookmarkModal,
        setActiveBookmark,
        clearActiveBookmark,
        removeSongFromActiveBookmark
    };
}
