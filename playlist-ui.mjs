/**
 * createPlaylistUiController を実行する
 * @param {*} data
 * @param {*} ui
 * @param {*} callbacks
 */
export function createPlaylistUiController({ data, ui, callbacks }) {
    const {
        clearSearchDebounce,
        resetSearchQuery,
        resetSearchFilters,
        scheduleSearch,
        onAddSongToPlaylist,
        onCreatePlaylistAndAdd,
        onDeletePlaylist,
        onRemoveSongFromPlaylist
    } = callbacks;

    /**
     * getSortedPlaylistIds を実行する
     */
    function getSortedPlaylistIds() {
        return Object.keys(data.playlists).sort((a, b) => {
            return (data.playlists[a].createdAt || 0) - (data.playlists[b].createdAt || 0);
        });
    }

    /**
     * setupPlaylistHandlers を実行する
     */
    function setupPlaylistHandlers() {
        const modal = ui.el.playlistModal;
        ui.el.playlistModalClose.addEventListener("click", closePlaylistModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closePlaylistModal();
        });

        ui.el.playlistModalCreateBtn.addEventListener("click", () => {
            const newName = ui.el.playlistModalNewName.value.trim();
            if (newName && ui.pendingPlaylistAction) {
                onCreatePlaylistAndAdd(newName, ui.pendingPlaylistAction.songKey);
                closePlaylistModal();
            }
        });

        ui.el.playlistModalNewName.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                ui.el.playlistModalCreateBtn.click();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            if (ui.el.playlistModal.hidden) return;
            e.preventDefault();
            e.stopPropagation();
            closePlaylistModal();
        }, true);
    }

    /**
     * renderPlaylists を実行する
     */
    function renderPlaylists() {
        const container = ui.el.playlistList;
        if (!container) return;

        const sortedIds = getSortedPlaylistIds();
        container.replaceChildren(...sortedIds.map((id) => {
            const p = data.playlists[id];
            const item = document.createElement("div");
            item.className = "playlist-item";
            item.dataset.playlistId = id;
            item.innerHTML = `
                <span class="playlist-item-name"></span>
                <span class="playlist-item-count">${p.songs.length}</span>
                <button class="playlist-delete-btn" aria-label="プレイリストを削除">&times;</button>
            `;
            item.querySelector(".playlist-item-name").textContent = p.name;

            if (data.activePlaylist === id) {
                item.classList.add("active");
            }

            item.addEventListener("click", (e) => {
                const target = e.target instanceof Element ? e.target : null;
                const deleteBtn = target ? target.closest(".playlist-delete-btn") : null;
                if (deleteBtn) {
                    e.stopPropagation();
                    if (confirm(`プレイリスト「${p.name}」を削除しますか？`)) {
                        onDeletePlaylist(id);
                    }
                    return;
                }

                if (data.activePlaylist === id) {
                    clearActivePlaylist();
                } else {
                    setActivePlaylist(id);
                }
            });

            return item;
        }));
    }

    /**
     * openPlaylistModal を実行する
     * @param {*} songKey
     */
    function openPlaylistModal(songKey) {
        ui.pendingPlaylistAction = { songKey };
        ui.el.playlistModal.hidden = false;

        const modalList = ui.el.playlistModalList;
        modalList.replaceChildren();

        const sortedIds = getSortedPlaylistIds();
        sortedIds.forEach((id) => {
            const p = data.playlists[id];
            const item = document.createElement("div");
            item.className = "playlist-modal-item";
            item.textContent = p.name;
            item.addEventListener("click", () => {
                onAddSongToPlaylist(id, songKey);
                closePlaylistModal();
            });
            modalList.appendChild(item);
        });

        ui.el.playlistModalNewName.value = "";
        ui.el.playlistModalNewName.focus();
    }

    /**
     * closePlaylistModal を実行する
     */
    function closePlaylistModal() {
        ui.el.playlistModal.hidden = true;
        ui.pendingPlaylistAction = null;
    }

    /**
     * setActivePlaylist を実行する
     * @param {*} playlistId
     */
    function setActivePlaylist(playlistId) {
        clearSearchDebounce();
        resetSearchQuery();
        resetSearchFilters();
        data.activePlaylist = playlistId;
        renderPlaylists();
        scheduleSearch({ immediate: true });
    }

    /**
     * clearActivePlaylist を実行する
     * @param {*} options
     */
    function clearActivePlaylist(options) {
        if (!data.activePlaylist) return;
        data.activePlaylist = null;
        renderPlaylists();
        if (!(options && options.skipSearch)) {
            scheduleSearch({ immediate: true });
        }
    }

    /**
     * removeSongFromActivePlaylist を実行する
     * @param {*} songKey
     */
    function removeSongFromActivePlaylist(songKey) {
        if (!data.activePlaylist) return;
        onRemoveSongFromPlaylist(data.activePlaylist, songKey);
    }

    return {
        setupPlaylistHandlers,
        renderPlaylists,
        openPlaylistModal,
        closePlaylistModal,
        setActivePlaylist,
        clearActivePlaylist,
        removeSongFromActivePlaylist
    };
}
