/**
 * createRenderController を実行する
 * @param {*} ui
 */
export function createRenderController({ data, ui, isAllFormatsSelected }) {
    let getSearchState = () => ({
        queryRaw: "",
        relayOnly: false,
        harmonyOnly: false,
        dateFromKey: null,
        dateToKey: null,
        hasDateFilter: false
    });
    let isRecommendedMode = () => false;
    let updateThumbnail = () => {};
    let extractYoutubeInfo = () => ({ videoId: "", startSeconds: 0 });
    let restoreActivePlayback = () => {};
    let openBookmarkModal = () => {};
    let setupScrollObserver = () => {};
    let removeSongFromActiveBookmark = () => {};

    /**
     * setDependencies を実行する
     * @param {*} next
     */
    function setDependencies(next) {
        if (!next) return;
        if (typeof next.getSearchState === "function") getSearchState = next.getSearchState;
        if (typeof next.isRecommendedMode === "function") isRecommendedMode = next.isRecommendedMode;
        if (typeof next.updateThumbnail === "function") updateThumbnail = next.updateThumbnail;
        if (typeof next.extractYoutubeInfo === "function") extractYoutubeInfo = next.extractYoutubeInfo;
        if (typeof next.restoreActivePlayback === "function") restoreActivePlayback = next.restoreActivePlayback;
        if (typeof next.openBookmarkModal === "function") openBookmarkModal = next.openBookmarkModal;
        if (typeof next.setupScrollObserver === "function") setupScrollObserver = next.setupScrollObserver;
        if (typeof next.removeSongFromActiveBookmark === "function") removeSongFromActiveBookmark = next.removeSongFromActiveBookmark;
    }

    /**
     * createCardElements を実行する
     */
    function createCardElements() {
        const card = document.createElement("div");
        card.className = "song-card";

        const thumbDiv = document.createElement("div");
        thumbDiv.className = "thumb";

        const content = document.createElement("div");
        content.className = "content";

        const title = document.createElement("a");
        title.className = "title";

        const artist = document.createElement("div");
        artist.className = "artist";

        const footer = document.createElement("div");
        footer.className = "card-footer";

        const leftGroup = document.createElement("div");
        leftGroup.className = "footer-left";
        const date = document.createElement("span");
        leftGroup.append(date);

        const rightGroup = document.createElement("div");
        rightGroup.className = "footer-right";

        const tags = document.createElement("div");
        tags.className = "footer-tags";

        const actionBtn = document.createElement("button");
        actionBtn.type = "button";

        rightGroup.append(tags, actionBtn);
        footer.append(leftGroup, rightGroup);
        content.append(title, artist, footer);
        card.append(thumbDiv, content);

        return { card, thumbDiv, titleEl: title, artistEl: artist, dateEl: date, tagsEl: tags, actionBtn };
    }

    /**
     * updateCardFromRow を実行する
     * @param {*} entry
     * @param {*} row
     */
    function updateCardFromRow(entry, row) {
        const yt = extractYoutubeInfo(row.url);
        updateThumbnail(entry.thumbDiv, yt);
        updateTitleLink(entry.titleEl, row);
        entry.artistEl.textContent = row.artist || "不明";
        entry.dateEl.textContent = row.date;
        updateFooterTags(entry.tagsEl, row);

        const isBookmarkActive = !!data.activeBookmark;
        const btn = entry.actionBtn;

        if (isBookmarkActive) {
            btn.textContent = "×";
            btn.className = "remove-from-bookmark-btn";
            btn.setAttribute("aria-label", "ブックマークから削除");
            btn.setAttribute("title", "ブックマークから削除");
            btn.onclick = () => {
                removeSongFromActiveBookmark(row.songKey);
            };
        } else {
            btn.textContent = "+";
            btn.className = "add-to-bookmark-btn";
            btn.setAttribute("aria-label", "ブックマークに追加");
            btn.setAttribute("title", "ブックマークに追加");
            btn.onclick = () => {
                openBookmarkModal(row.songKey);
            };
        }
    }

    /**
     * updateTitleLink を実行する
     * @param {*} titleEl
     * @param {*} row
     */
    function updateTitleLink(titleEl, row) {
        titleEl.textContent = row.title || "無題";
        if (row.url) {
            titleEl.classList.add("title-link");
            titleEl.setAttribute("href", row.url);
            titleEl.setAttribute("target", "_blank");
            titleEl.setAttribute("rel", "noopener noreferrer");
        } else {
            titleEl.classList.remove("title-link");
            titleEl.removeAttribute("href");
            titleEl.removeAttribute("target");
            titleEl.removeAttribute("rel");
        }
    }

    /**
     * updateFooterTags を実行する
     * @param {*} tags
     * @param {*} row
     */
    function updateFooterTags(tags, row) {
        tags.replaceChildren();
        if (row.format) {
            const fmt = document.createElement("span");
            fmt.className = "tag";
            fmt.textContent = row.format;
            tags.appendChild(fmt);
        }
        if (row.isRelay) {
            const relay = document.createElement("span");
            relay.className = "tag tag-relay";
            relay.textContent = "🚩リレー";
            tags.appendChild(relay);
        }
        if (row.isHarmony) {
            const harmony = document.createElement("span");
            harmony.className = "tag tag-harmony";
            harmony.textContent = "✨ハモリ";
            tags.appendChild(harmony);
        }
    }

    /**
     * createEmptyStateElement を実行する
     * @param {*} message
     */
    function createEmptyStateElement(message) {
        const empty = document.createElement("div");
        empty.style.gridColumn = "1/-1";
        empty.style.textAlign = "center";
        empty.style.padding = "50px";
        empty.style.color = "var(--text-mute)";
        empty.textContent = message;
        return empty;
    }

    /**
     * getEmptyStateDescriptor を実行する
     */
    function getEmptyStateDescriptor() {
        if (!ui.dataReady) {
            return { kind: "loading", message: "読み込み中..." };
        }
        if (!isAllFormatsSelected() && ui.selectedFormats.size === 0) {
            return { kind: "error", message: "動画の種類を選択してください" };
        }
        return { kind: "empty", message: "見つかりませんでした" };
    }

    /**
     * getVisibleResults を実行する
     */
    function getVisibleResults() {
        return data.currentResults.slice(0, data.displayLimit);
    }

    /**
     * renderEmptyResults を実行する
     * @param {*} container
     * @param {*} loadMoreContainer
     */
    function renderEmptyResults(container, loadMoreContainer) {
        restoreActivePlayback();
        const emptyState = getEmptyStateDescriptor(getSearchState());
        container.replaceChildren(createEmptyStateElement(emptyState.message));
        loadMoreContainer.classList.add("hidden");
    }

    /**
     * collectActiveCardRenderState を実行する
     * @param {*} container
     * @param {*} nodes
     */
    function collectActiveCardRenderState(container, nodes) {
        const activeThumb = ui.activeThumb;
        const activeCard = activeThumb ? activeThumb.closest(".song-card") : null;
        const isActiveCardInNextNodes =
            activeCard instanceof HTMLElement &&
            container.contains(activeCard) &&
            nodes.includes(activeCard);
        const hasEmbeddedPlayer = Boolean(activeThumb && activeThumb.querySelector("iframe"));
        return { activeThumb, activeCard, isActiveCardInNextNodes, hasEmbeddedPlayer };
    }

    /**
     * stopActivePlaybackIfHidden を実行する
     * @param {*} activeState
     */
    function stopActivePlaybackIfHidden(activeState) {
        if (!activeState.activeThumb) return;
        if (activeState.isActiveCardInNextNodes) return;
        restoreActivePlayback();
    }

    /**
     * buildResultNodes を実行する
     * @param {*} results
     */
    function buildResultNodes(results) {
        const nextEntriesBySourceKey = new Map();
        const entries = [];
        const nodes = [];
        for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const rowKey = row && typeof row.songKey === "string" && row.songKey
                ? `song:${row.songKey}`
                : (row && Number.isFinite(row.sourceIndex) ? `src:${row.sourceIndex}` : `idx:${i}`);
            let entry = ui.cardEntriesBySourceKey.get(rowKey);
            if (!entry) entry = createCardElements();
            updateCardFromRow(entry, results[i]);
            nextEntriesBySourceKey.set(rowKey, entry);
            entries.push(entry);
            nodes.push(entry.card);
        }
        ui.cardEntriesBySourceKey = nextEntriesBySourceKey;
        return { nodes, entries };
    }

    /**
     * getPinnedActiveCard を実行する
     * @param {*} activeState
     */
    function getPinnedActiveCard(activeState) {
        if (!activeState.isActiveCardInNextNodes) return null;
        if (!activeState.hasEmbeddedPlayer) return null;
        return activeState.activeCard;
    }

    /**
     * reconcileNodesWithPinnedActive を実行する
     * @param {*} container
     * @param {*} nodes
     * @param {*} pinnedActiveCard
     */
    function reconcileNodesWithPinnedActive(container, nodes, pinnedActiveCard) {
        const keepSet = new Set(nodes);
        Array.from(container.children).forEach((child) => {
            if (child === pinnedActiveCard) return;
            if (!keepSet.has(child)) container.removeChild(child);
        });

        let cursor = container.firstChild;
        for (const node of nodes) {
            if (node === pinnedActiveCard) {
                if (cursor === pinnedActiveCard) cursor = cursor.nextSibling;
                continue;
            }
            if (node === cursor) {
                cursor = cursor.nextSibling;
                continue;
            }
            container.insertBefore(node, cursor);
        }
    }

    /**
     * reconcileNodesByOrder を実行する
     * @param {*} container
     * @param {*} nodes
     */
    function reconcileNodesByOrder(container, nodes) {
        const children = container.children;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const current = children[i];
            if (current !== node) {
                container.insertBefore(node, current || null);
            }
        }
        while (container.children.length > nodes.length) {
            const last = container.lastElementChild;
            if (!last) break;
            container.removeChild(last);
        }
    }

    /**
     * reconcileResultNodes を実行する
     * @param {*} container
     * @param {*} nodes
     */
    function reconcileResultNodes(container, nodes) {
        const activeState = collectActiveCardRenderState(container, nodes);
        stopActivePlaybackIfHidden(activeState);
        const pinnedActiveCard = getPinnedActiveCard(activeState);
        if (pinnedActiveCard) {
            reconcileNodesWithPinnedActive(container, nodes, pinnedActiveCard);
            return;
        }
        reconcileNodesByOrder(container, nodes);
    }

    /**
     * observeVisibleThumbnails を実行する
     * @param {*} entries
     */
    function observeVisibleThumbnails(entries) {
        if (!ui.showThumbnails || !ui.scrollObserver) return;
        for (const entry of entries) {
            ui.scrollObserver.observe(entry.thumbDiv);
        }
    }

    /**
     * updateLoadMoreVisibility を実行する
     * @param {*} recommendedMode
     */
    function updateLoadMoreVisibility(recommendedMode) {
        const loadMoreContainer = ui.el.loadMoreContainer;
        if (!recommendedMode && data.currentResults.length > data.displayLimit) {
            loadMoreContainer.classList.remove("hidden");
        } else {
            loadMoreContainer.classList.add("hidden");
        }
    }

    /**
     * collectDisplayState を実行する
     */
    function collectDisplayState() {
        return {
            container: ui.el.resultList,
            results: getVisibleResults(),
            recommendedMode: isRecommendedMode(getSearchState())
        };
    }

    /**
     * prepareDisplayObservation を実行する
     */
    function prepareDisplayObservation() {
        if (ui.scrollObserver) ui.scrollObserver.disconnect();
        if (ui.showThumbnails && !ui.scrollObserver) setupScrollObserver();
    }

    /**
     * renderDisplayState を実行する
     * @param {*} displayState
     */
    function renderDisplayState(displayState) {
        const { container, results } = displayState;
        if (results.length === 0) {
            renderEmptyResults(container, ui.el.loadMoreContainer);
            return null;
        }
        const { nodes, entries } = buildResultNodes(results);
        reconcileResultNodes(container, nodes);
        return { entries };
    }

    /**
     * monitorDisplayState を実行する
     * @param {*} rendered
     * @param {*} displayState
     */
    function monitorDisplayState(rendered, displayState) {
        observeVisibleThumbnails(rendered.entries);
        updateLoadMoreVisibility(displayState.recommendedMode);
    }

    /**
     * updateDisplay を実行する
     */
    function updateDisplay() {
        const displayState = collectDisplayState();
        prepareDisplayObservation();
        const rendered = renderDisplayState(displayState);
        if (!rendered) return;
        monitorDisplayState(rendered, displayState);
    }

    return {
        setDependencies,
        updateDisplay
    };
}
