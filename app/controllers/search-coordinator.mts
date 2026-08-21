import type { SearchUiRuntimeState } from "../state.types";

type SearchCoordinatorInput = {
    search: Pick<SearchUiRuntimeState, "debounceId">;
    debounceMs: number;
    searchController: {
        search: () => void;
    };
    dataLoader: {
        commitPendingSnapshot: () => boolean;
    };
    callbacks: {
        reconcileBookmarksAfterSongsCommitted: () => void;
    };
};

/**
 * 保留中の曲データ反映と検索実行を順序付け、検索デバウンスを管理する。
 */
export function createSearchCoordinator({
    search,
    debounceMs,
    searchController,
    dataLoader,
    callbacks
}: SearchCoordinatorInput) {
    /**
     * 保留中の検索タイマーを解除し、未予約状態へ戻す。
     */
    function cancelScheduledSearch(): void {
        if (!search.debounceId) return;
        clearTimeout(search.debounceId);
        search.debounceId = 0;
    }

    /**
     * 最新スナップショットを反映してから検索を実行する。
     */
    function runSearch(): void {
        if (dataLoader.commitPendingSnapshot()) {
            callbacks.reconcileBookmarksAfterSongsCommitted();
        }
        searchController.search();
    }

    /**
     * デバウンス付きで検索を予約し、必要時は即時実行する。
     * @param options 検索予約方法
     */
    function scheduleSearch(options?: { immediate?: boolean }): void {
        cancelScheduledSearch();
        if (options?.immediate) {
            runSearch();
            return;
        }
        search.debounceId = setTimeout(() => {
            search.debounceId = 0;
            runSearch();
        }, debounceMs);
    }

    return {
        cancelScheduledSearch,
        scheduleSearch,
        search: runSearch
    };
}
