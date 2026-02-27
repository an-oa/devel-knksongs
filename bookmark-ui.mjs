/**
 * createBookmarkUiController を実行する
 * @param {*} data
 * @param {*} ui
 * @param {*} callbacks
 */
export function createBookmarkUiController({ data, ui, callbacks }) {
    const {
        clearSearchDebounce,
        resetSearchQuery,
        resetSearchFilters,
        scheduleSearch,
        onAddSongToBookmark,
        onCreateBookmarkAndAdd,
        onDeleteBookmark,
        onRemoveSongFromBookmark
    } = callbacks;

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
                onCreateBookmarkAndAdd(newName, ui.pendingBookmarkAction.songKey);
                closeBookmarkModal();
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
                onAddSongToBookmark(id, songKey);
                closeBookmarkModal();
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
        resetSearchQuery();
        resetSearchFilters();
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

