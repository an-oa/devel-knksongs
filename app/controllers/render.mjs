import { scheduleScrollElementIntoView } from "../lib/results-scroll.mjs?v=11";
import { getPlaybackUiState, getRenderUiState, getSearchUiState } from "../lib/ui-slices.mjs?v=11";

/**
 * 検索結果カードの生成・差分反映・表示更新を担うレンダーコントローラーを作成する。
 * @param {*} ui
 */
export function createRenderController({ data, ui, isAllFormatsSelected, incrementCount = 48 }) {
    const searchUi = getSearchUiState(ui);
    const playbackUi = getPlaybackUiState(ui);
    const renderUi = getRenderUiState(ui);
    const MASONRY_GAP_PX = 12;
    const MASONRY_BREAKPOINTS = [
        { minWidth: 1400, columns: 4 },
        { minWidth: 1000, columns: 3 },
        { minWidth: 600, columns: 2 }
    ];
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
    let playThumbnail = () => false;
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
        if (typeof next.playThumbnail === "function") playThumbnail = next.playThumbnail;
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
        const bookmarkSongRef = getBookmarkSongRef(row);
        const yt = buildYoutubeTarget(row);
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
                removeSongFromActiveBookmark(bookmarkSongRef);
            };
        } else {
            btn.textContent = "+";
            btn.className = "add-to-bookmark-btn";
            btn.setAttribute("aria-label", "ブックマークに追加");
            btn.setAttribute("title", "ブックマークに追加");
            btn.onclick = () => {
                openBookmarkModal(bookmarkSongRef);
            };
        }
    }

    /**
     * 行データからブックマーク保存に使う参照キーを返す。
     * @param {*} row
     * @returns {string}
     */
    function getBookmarkSongRef(row) {
        if (!row || typeof row !== "object") return "";
        if (typeof row.bookmarkSongKey === "string" && row.bookmarkSongKey) {
            return row.bookmarkSongKey;
        }
        return typeof row.songKey === "string" ? row.songKey : "";
    }

    /**
     * 曲行からサムネイル/埋め込み再生に必要な YouTube 情報を組み立てる。
     * @param {*} row
     */
    function buildYoutubeTarget(row) {
        const extracted = extractYoutubeInfo(row.url);
        return {
            ...extracted,
            endSeconds: row.endSeconds,
            isVertical: row.videoOrientation
                ? row.videoOrientation === "vertical"
                : extracted.isVertical
        };
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
        if (!searchUi.dataReady) {
            return { kind: "loading", message: "読み込み中..." };
        }
        if (!isAllFormatsSelected() && searchUi.selectedFormats.size === 0) {
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
     * 曲キーに対応する描画エントリを返す。
     * @param {string} songKey
     * @returns {*}
     */
    function getCardEntryBySongKey(songKey) {
        if (!songKey) return null;
        return renderUi.cardEntriesBySourceKey.get(`song:${songKey}`) || null;
    }

    /**
     * 指定インデックスの曲が表示範囲外なら、表示上限を広げて描画する。
     * @param {number} index
     */
    function ensureResultVisible(index) {
        if (!Number.isFinite(index) || index < 0) return;
        if (index < data.displayLimit) return;
        const nextLimit = Math.ceil((index + 1) / incrementCount) * incrementCount;
        data.displayLimit = Math.min(data.currentResults.length, nextLimit);
        updateDisplay();
    }

    /**
     * 曲キーに対応するカードを必要に応じて描画し、再生開始する。
     * @param {string} songKey
     * @returns {boolean}
     */
    function playSongByKey(songKey) {
        const index = data.currentResults.findIndex((row) => row && row.songKey === songKey);
        if (index === -1) return false;
        ensureResultVisible(index);
        let entry = getCardEntryBySongKey(songKey);
        if (!entry) {
            updateDisplay();
            entry = getCardEntryBySongKey(songKey);
        }
        if (!entry) return false;
        return Boolean(playThumbnail(entry.thumbDiv, buildYoutubeTarget(data.currentResults[index])));
    }

    /**
     * 指定曲のカードが見える位置まで、固定ヘッダーを避けてスクロールする。
     * @param {string} songKey
     */
    function scrollSongIntoView(songKey) {
        const entry = getCardEntryBySongKey(songKey);
        if (!entry) return;
        const header = document.querySelector(".header");
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        scheduleScrollElementIntoView(entry.card, {
            topOffset: headerHeight,
            behavior: "smooth"
        });
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
        container.style.height = "";
        loadMoreContainer.classList.add("hidden");
    }

    /**
     * 描画更新前のアクティブカード・再生状態を収集する。
     * @param {*} container
     * @param {*} nodes
     */
    function collectActiveCardRenderState(container, nodes) {
        const activeThumb = playbackUi.activeThumb;
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
            .map((row) => getBookmarkSongRef(row))
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
            let entry = renderUi.cardEntriesBySourceKey.get(rowKey);
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
        renderUi.cardEntriesBySourceKey = nextEntriesBySourceKey;
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

        const pinnedIndex = nodes.indexOf(pinnedActiveCard);
        if (pinnedIndex === -1) return;

        for (let i = 0; i < pinnedIndex; i++) {
            const node = nodes[i];
            if (node !== pinnedActiveCard) {
                container.insertBefore(node, pinnedActiveCard);
            }
        }

        let anchor = null;
        for (let i = nodes.length - 1; i > pinnedIndex; i--) {
            const node = nodes[i];
            if (node === pinnedActiveCard) continue;
            container.insertBefore(node, anchor);
            anchor = node;
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

    function getMasonryColumnCount(containerWidth) {
        for (const rule of MASONRY_BREAKPOINTS) {
            if (containerWidth >= rule.minWidth) return rule.columns;
        }
        return 1;
    }

    /**
     * DOM順を列固定で保ちつつカードを絶対配置する。
     * 同じ列のカードだけが上下に影響し、他列の位置は維持される。
     */
    function refreshLayout() {
        const container = ui.el.resultList;
        if (!container) return;
        const cards = Array.from(container.children).filter((node) => (
            node instanceof HTMLElement &&
            node.classList.contains("song-card")
        ));
        if (cards.length === 0) {
            container.style.height = "";
            return;
        }
        const containerRect = container.getBoundingClientRect();
        const containerWidth = container.clientWidth || containerRect.width || 0;
        if (containerWidth <= 0) return;
        const columnCount = getMasonryColumnCount(containerWidth);
        const totalGap = MASONRY_GAP_PX * (columnCount - 1);
        const columnWidth = Math.max(0, (containerWidth - totalGap) / columnCount);
        const columnHeights = Array.from({ length: columnCount }, () => 0);
        for (const node of cards) {
            node.style.width = `${columnWidth}px`;
            node.style.left = "0px";
            node.style.top = "0px";
            node.style.transform = "translate(0px, 0px)";
        }
        for (let index = 0; index < cards.length; index++) {
            const node = cards[index];
            const contentHeight = Number.isFinite(node.scrollHeight) && node.scrollHeight > 0
                ? node.scrollHeight
                : node.getBoundingClientRect().height;
            const columnIndex = index % columnCount;
            const top = columnHeights[columnIndex];
            const left = (columnWidth + MASONRY_GAP_PX) * columnIndex;
            node.style.left = `${left}px`;
            node.style.top = `${top}px`;
            node.style.transform = "none";
            node.dataset.layoutColumn = String(columnIndex);
            columnHeights[columnIndex] = top + contentHeight + MASONRY_GAP_PX;
        }
        const tallest = Math.max(...columnHeights);
        container.style.height = `${Math.max(0, tallest - MASONRY_GAP_PX)}px`;
    }

    /**
     * 表示中カードのサムネイルをIntersectionObserverへ登録する。
     * @param {*} entries
     */
    function observeVisibleThumbnails(entries) {
        if (!playbackUi.showThumbnails || !playbackUi.scrollObserver) return;
        for (const entry of entries) {
            playbackUi.scrollObserver.observe(entry.thumbDiv);
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
        if (playbackUi.scrollObserver) playbackUi.scrollObserver.disconnect();
        if (playbackUi.showThumbnails && !playbackUi.scrollObserver) setupScrollObserver();
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
        playSongByKey,
        scrollSongIntoView,
        updateDisplay,
        refreshLayout
    };
}
