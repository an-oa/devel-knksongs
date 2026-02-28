/**
 * createBookmarkUiController を実行する
 * @param {*} data
 * @param {*} ui
 * @param {*} callbacks
 */
export function createBookmarkUiController({ data, ui, callbacks }) {
    const {
        clearSearchDebounce,
        scheduleSearch,
        onAddSongToBookmark,
        onCreateBookmarkAndAdd,
        onDeleteBookmark,
        onRemoveSongFromBookmark
    } = callbacks;

    /**
     * normalizeActionResult を実行する
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
     * notifyIfLimitError を実行する
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
     * getSortedBookmarkIds を実行する
     */
    function getSortedBookmarkIds() {
        return Object.keys(data.bookmarks).sort((a, b) => {
            return (data.bookmarks[a].createdAt || 0) - (data.bookmarks[b].createdAt || 0);
        });
    }

    /**
     * setupBookmarkHandlers を実行する
     */
    function setupBookmarkHandlers() {
        const modal = ui.el.bookmarkModal;
        ui.el.bookmarkModalClose.addEventListener("click", closeBookmarkModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeBookmarkModal();
        });

        ui.el.bookmarkModalCreateBtn.addEventListener("click", () => {
            const newName = ui.el.bookmarkModalNewName.value.trim();
            if (newName && ui.pendingBookmarkAction) {
                const result = normalizeActionResult(
                    onCreateBookmarkAndAdd(newName, ui.pendingBookmarkAction.songKey)
                );
                if (result.ok) {
                    closeBookmarkModal();
                    return;
                }
                if (!notifyIfLimitError(result)) {
                    closeBookmarkModal();
                }
            }
        });

        ui.el.bookmarkModalNewName.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                ui.el.bookmarkModalCreateBtn.click();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            if (ui.el.bookmarkModal.hidden) return;
            e.preventDefault();
            e.stopPropagation();
            closeBookmarkModal();
        }, true);
    }

    /**
     * renderBookmarks を実行する
     */
    function renderBookmarks() {
        const container = ui.el.bookmarkList;
        if (!container) return;

        const sortedIds = getSortedBookmarkIds();
        container.replaceChildren(...sortedIds.map((id) => {
            const p = data.bookmarks[id];
            const item = document.createElement("div");
            item.className = "bookmark-item";
            item.dataset.bookmarkId = id;
            item.innerHTML = `
                <span class="bookmark-item-name"></span>
                <span class="bookmark-item-count">${p.songs.length}</span>
                <button class="bookmark-delete-btn" aria-label="ブックマークを削除">&times;</button>
            `;
            item.querySelector(".bookmark-item-name").textContent = p.name;

            if (data.activeBookmark === id) {
                item.classList.add("active");
            }

            item.addEventListener("click", (e) => {
                const target = e.target instanceof Element ? e.target : null;
                const deleteBtn = target ? target.closest(".bookmark-delete-btn") : null;
                if (deleteBtn) {
                    e.stopPropagation();
                    if (confirm(`ブックマーク「${p.name}」を削除しますか？`)) {
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
     * openBookmarkModal を実行する
     * @param {*} songKey
     */
    function openBookmarkModal(songKey) {
        ui.pendingBookmarkAction = { songKey };
        ui.el.bookmarkModal.hidden = false;

        const modalList = ui.el.bookmarkModalList;
        modalList.replaceChildren();

        const sortedIds = getSortedBookmarkIds();
        sortedIds.forEach((id) => {
            const p = data.bookmarks[id];
            const item = document.createElement("div");
            item.className = "bookmark-modal-item";
            item.textContent = p.name;
            item.addEventListener("click", () => {
                const result = normalizeActionResult(onAddSongToBookmark(id, songKey));
                if (result.ok) {
                    closeBookmarkModal();
                    return;
                }
                if (!notifyIfLimitError(result)) {
                    closeBookmarkModal();
                }
            });
            modalList.appendChild(item);
        });

        ui.el.bookmarkModalNewName.value = "";
        ui.el.bookmarkModalNewName.focus();
    }

    /**
     * closeBookmarkModal を実行する
     */
    function closeBookmarkModal() {
        ui.el.bookmarkModal.hidden = true;
        ui.pendingBookmarkAction = null;
    }

    /**
     * setActiveBookmark を実行する
     * @param {*} bookmarkId
     */
    function setActiveBookmark(bookmarkId) {
        clearSearchDebounce();
        data.activeBookmark = bookmarkId;
        renderBookmarks();
        scheduleSearch({ immediate: true });
    }

    /**
     * clearActiveBookmark を実行する
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
     * removeSongFromActiveBookmark を実行する
     * @param {*} songKey
     */
    function removeSongFromActiveBookmark(songKey) {
        if (!data.activeBookmark) return;
        onRemoveSongFromBookmark(data.activeBookmark, songKey);
    }

    return {
        setupBookmarkHandlers,
        renderBookmarks,
        openBookmarkModal,
        closeBookmarkModal,
        setActiveBookmark,
        clearActiveBookmark,
        removeSongFromActiveBookmark
    };
}
