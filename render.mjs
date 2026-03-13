/**
 * 検索結果カードの生成・差分反映・表示更新を担うレンダーコントローラーを作成する。
 * @param {*} ui
 */
export function createRenderController({ data, ui, isAllFormatsSelected }) {
    const MASONRY_AUTO_ROW_PX = 4;
    const MASONRY_GAP_PX = 12;
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
    let saveBookmarks = () => {};

    /**
     * 描画時に利用する外部依存関数を差し替える。
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
        if (typeof next.saveBookmarks === "function") saveBookmarks = next.saveBookmarks;
    }

    /**
     * 結果カードを構成するDOM要素一式を生成する。
     */
    function createCardElements() {
        const card = document.createElement("div");
        card.className = "song-card";
        card.draggable = false;

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

        const dragHandle = document.createElement("div");
        dragHandle.className = "drag-handle";
        dragHandle.innerHTML = "⠿";
        dragHandle.hidden = true;
        dragHandle.draggable = false;

        dragHandle.addEventListener("dragstart", onDragStart);
        dragHandle.addEventListener("dragend", onDragEnd);
        card.addEventListener("dragover", onDragOver);
        card.addEventListener("dragleave", onDragLeave);
        card.addEventListener("drop", onDrop);

        rightGroup.append(tags, actionBtn);
        footer.append(leftGroup, rightGroup);
        content.append(dragHandle, title, artist, footer);
        card.append(thumbDiv, content);

        return { card, thumbDiv, titleEl: title, artistEl: artist, dateEl: date, tagsEl: tags, actionBtn, dragHandle };
    }

    /**
     * 曲データをカード要素へ反映し、アクションボタンの挙動を設定する。
     * @param {*} entry
     * @param {*} row
     */
    function updateCardFromRow(entry, row) {
        const extracted = extractYoutubeInfo(row.url);
        const yt = {
            ...extracted,
            isVertical: row.videoOrientation
                ? row.videoOrientation === "vertical"
                : extracted.isVertical
        };
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
     * タイトル表示とリンク属性を更新する。
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
     * 形式・リレー・ハモリのタグ表示を更新する。
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
     * 空結果表示用のメッセージ要素を生成する。
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
     * 現在状態に応じた空結果メッセージ種別を決定する。
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
     * 表示上限を考慮した可視結果一覧を返す。
     */
    function getVisibleResults() {
        return data.currentResults.slice(0, data.displayLimit);
    }

    /**
     * 空結果UIを描画し、再生状態と「もっと見る」表示をリセットする。
     * @param {*} container
     * @param {*} loadMoreContainer
     */
    function renderEmptyResults(container, loadMoreContainer) {
        restoreActivePlayback();
        const emptyState = getEmptyStateDescriptor(getSearchState());
        container.replaceChildren(createEmptyStateElement(emptyState.message));
        refreshLayout();
        loadMoreContainer.classList.add("hidden");
    }

    /**
     * 描画更新前のアクティブカード・再生状態を収集する。
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
     * アクティブ再生カードが次表示に含まれない場合は再生を停止する。
     * @param {*} activeState
     */
    function stopActivePlaybackIfHidden(activeState) {
        if (!activeState.activeThumb) return;
        if (activeState.isActiveCardInNextNodes) return;
        restoreActivePlayback();
    }

    function onDragStart(event) {
        if (!data.activeBookmark) {
            event.preventDefault();
            return;
        }
        const handle = event.currentTarget;
        if (!(handle instanceof HTMLElement)) return;
        const card = handle.closest(".song-card");
        if (!(card instanceof HTMLElement)) return;
        const songKey = card.dataset.songKey || "";
        if (!songKey) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.setData("text/plain", songKey);
        event.dataTransfer.effectAllowed = "move";
        card.classList.add("dragging");
    }

    function onDragEnd(event) {
        const handle = event.currentTarget;
        if (!(handle instanceof HTMLElement)) return;
        const card = handle.closest(".song-card");
        if (!(card instanceof HTMLElement)) return;
        card.classList.remove("dragging");
        card.classList.remove("drag-over");
    }

    function onDragOver(event) {
        if (!data.activeBookmark) return;
        event.preventDefault();
        const targetCard = event.target.closest(".song-card");
        if (!(targetCard instanceof HTMLElement)) return;
        targetCard.classList.add("drag-over");
    }

    function onDragLeave(event) {
        const targetCard = event.target.closest(".song-card");
        if (!(targetCard instanceof HTMLElement)) return;
        targetCard.classList.remove("drag-over");
    }

    function onDrop(event) {
        if (!data.activeBookmark) return;
        event.preventDefault();
        const draggedKey = event.dataTransfer.getData("text/plain");
        const targetCard = event.target.closest(".song-card");
        if (!targetCard) return;
        targetCard.classList.remove("drag-over");

        const targetKey = targetCard.dataset.songKey;
        if (draggedKey === targetKey) return;

        const fromIndex = data.currentResults.findIndex(song => song.songKey === draggedKey);
        const toIndex = data.currentResults.findIndex(song => song.songKey === targetKey);

        if (fromIndex === -1 || toIndex === -1) return;

        const [movedItem] = data.currentResults.splice(fromIndex, 1);
        data.currentResults.splice(toIndex, 0, movedItem);

        persistActiveBookmarkOrder();
        saveBookmarks();

        updateDisplay();
    }

    function persistActiveBookmarkOrder() {
        if (!data.activeBookmark) return;
        const bookmark = data.bookmarks[data.activeBookmark];
        if (!bookmark || !Array.isArray(bookmark.songs) || bookmark.songs.length === 0) return;

        const orderedKeys = data.currentResults
            .map((row) => (row && typeof row.songKey === "string" ? row.songKey : ""))
            .filter(Boolean);
        if (orderedKeys.length === 0) return;

        const reorderSet = new Set(orderedKeys);
        const queue = orderedKeys.slice();
        const nextSongs = bookmark.songs.map((songKey) => {
            if (!reorderSet.has(songKey)) return songKey;
            return queue.length > 0 ? queue.shift() : songKey;
        });

        const changed = nextSongs.some((songKey, idx) => songKey !== bookmark.songs[idx]);
        if (!changed) return;
        bookmark.songs = nextSongs;
    }

    /**
     * 結果配列からカードノードを再利用しつつ構築する。
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

            entry.card.dataset.songKey = row.songKey;
            const isBookmarkActive = Boolean(data.activeBookmark);
            entry.card.draggable = false;
            entry.card.classList.remove("dragging", "drag-over");
            entry.dragHandle.hidden = !isBookmarkActive;
            entry.dragHandle.draggable = isBookmarkActive;

            updateCardFromRow(entry, results[i]);
            nextEntriesBySourceKey.set(rowKey, entry);
            entries.push(entry);
            nodes.push(entry.card);
        }
        ui.cardEntriesBySourceKey = nextEntriesBySourceKey;
        return { nodes, entries };
    }

    /**
     * 再生中カードを描画順維持対象として固定するか判定する。
     * @param {*} activeState
     */
    function getPinnedActiveCard(activeState) {
        if (!activeState.isActiveCardInNextNodes) return null;
        if (!activeState.hasEmbeddedPlayer) return null;
        return activeState.activeCard;
    }

    /**
     * 再生中カードの位置を保ったまま、結果ノードとの差分を反映する。
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
     * 結果ノード順にDOMを並べ替え、余分なノードを除去する。
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
     * 再生状態を考慮した方法で結果ノードをDOMへ反映する。
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
     * カード高さから疑似masonryレイアウト用の行スパンを再計算する。
     */
    function refreshLayout() {
        const container = ui.el.resultList;
        if (!container) return;
        const cards = Array.from(container.children).filter((node) => (
            node instanceof HTMLElement &&
            node.classList.contains("song-card")
        ));
        for (const node of cards) {
            node.style.gridRowEnd = "span 1";
        }
        for (const node of cards) {
            if (!(node instanceof HTMLElement)) continue;
            const contentHeight = Number.isFinite(node.scrollHeight) && node.scrollHeight > 0
                ? node.scrollHeight
                : node.getBoundingClientRect().height;
            const span = Math.max(1, Math.ceil((contentHeight + MASONRY_GAP_PX) / (MASONRY_AUTO_ROW_PX + MASONRY_GAP_PX)));
            node.style.gridRowEnd = `span ${span}`;
        }
    }

    /**
     * 表示中カードのサムネイルをIntersectionObserverへ登録する。
     * @param {*} entries
     */
    function observeVisibleThumbnails(entries) {
        if (!ui.showThumbnails || !ui.scrollObserver) return;
        for (const entry of entries) {
            ui.scrollObserver.observe(entry.thumbDiv);
        }
    }

    /**
     * 推薦モードと件数に応じて「もっと見る」表示を切り替える。
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
     * 描画に必要なコンテナ・結果・モード情報をまとめる。
     */
    function collectDisplayState() {
        return {
            container: ui.el.resultList,
            results: getVisibleResults(),
            recommendedMode: isRecommendedMode(getSearchState())
        };
    }

    /**
     * 描画前に監視状態を初期化し、必要なら監視を再設定する。
     */
    function prepareDisplayObservation() {
        if (ui.scrollObserver) ui.scrollObserver.disconnect();
        if (ui.showThumbnails && !ui.scrollObserver) setupScrollObserver();
    }

    /**
     * 表示状態に応じて空結果または結果カードを描画する。
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
        refreshLayout();
        return { entries };
    }

    /**
     * 描画後のサムネイル監視と「もっと見る」状態を更新する。
     * @param {*} rendered
     * @param {*} displayState
     */
    function monitorDisplayState(rendered, displayState) {
        observeVisibleThumbnails(rendered.entries);
        updateLoadMoreVisibility(displayState.recommendedMode);
    }

    /**
     * 収集・描画・監視更新までの表示更新パイプラインを行う。
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
        updateDisplay,
        refreshLayout
    };
}
