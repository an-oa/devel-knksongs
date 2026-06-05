declare module "../lib/playback-sequence.mjs?*" {
  export function getPlaybackContinuationCandidates(
    rows: Array<{ songKey?: string }>,
    finishedSongKey: string,
    options: {
      continuousPlayback?: boolean,
      loopPlayback?: boolean
    }
  ): string[];
}

declare module "../lib/playback-debug.mjs?*" {
  export function debugPlayback(scope: string, message: string, details?: unknown): void;
  export function tracePlayback(scope: string, message: string, details?: unknown): void;
}

declare module "../lib/dom-utils.mjs?*" {
  export function canUseDom(): boolean;
  export function getHeaderHeight(): number;
  export function isHtmlElement(value: unknown): value is HTMLElement;
}

declare module "../lib/layout-anchor.mjs?*" {
  export function createLayoutRefreshScheduler(
    getRefreshLayout: () => (() => void)
  ): (anchorElement?: Element | null) => Promise<boolean>;
}

declare module "../lib/stream-role.mjs?*" {
  export function hasStreamRole(value: unknown): boolean;
}

declare module "../lib/results-scroll.mjs?*" {
  export function scheduleScrollElementIntoView(
    element: Element | null | undefined,
    options?: { topOffset?: number; behavior?: "auto" | "smooth"; force?: boolean }
  ): Promise<void>;
}

declare module "../lib/render/drag-reorder.mjs?*" {
  export function createBookmarkDragReorderController(input: {
    data: Pick<AppDataState, "bookmarks" | "currentResults" | "activeBookmark">;
    getBookmarkSongRef: (row: Song | null | undefined) => string;
    saveBookmarks: () => void;
    updateDisplay: () => void;
  }): {
    onDragStart: (event: DragEvent) => void;
    onDragEnd: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
    persistActiveBookmarkOrder: () => boolean;
  };
}

declare module "../lib/render/masonry-layout.mjs?*" {
  export function applyMasonryLayout(
    container: Element | null | undefined,
    options?: { gapPx?: number; breakpoints?: Array<{ minWidth: number; columns: number }> }
  ): void;
}

declare module "../lib/ui-slices.mjs?*" {
  export function getDateUiState(ui: DateUiStateSource): DateUiRuntimeState;
  export function getPlaybackUiState(ui: PlaybackUiStateSource): PlaybackUiRuntimeState;
  export function getSearchUiState(ui: SearchUiStateSource): SearchUiRuntimeState;
  export function getLookupUiState(ui: LookupUiStateSource): LookupUiRuntimeState;
  export function getRenderUiState(ui: RenderUiStateSource): RenderUiRuntimeState;
  export function getBookmarkPanelUiState(ui: BookmarkPanelUiStateSource): BookmarkPanelUiRuntimeState;
  export function getSettingsPanelUiState(ui: SettingsPanelUiStateSource): SettingsPanelUiRuntimeState;
}

declare module "../lib/playback-settings/definitions.mjs?*" {
  export const THUMBNAIL_STORAGE_KEY: "showThumbnails";
  export const PLAY_ARCHIVE_TO_END_STORAGE_KEY: "playArchiveToEnd";
  export const LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS: readonly string[];
  export const PLAYBACK_SETTING_SCOPES: {
    readonly PERSISTED: "persisted";
    readonly PAGE: "page";
  };
  export const PLAYBACK_SETTING_KINDS: {
    readonly VISIBILITY: "visibility";
    readonly BEHAVIOR: "behavior";
  };
  export const INITIAL_PLAYBACK_SETTING_VALUES: {
    readonly playArchiveToEnd: false;
    readonly continuousPlayback: false;
    readonly loopPlayback: false;
  };
  export function createPlaybackSettingDefinitions(input: {
    restoreActivePlayback: () => void;
    syncExperimentalPlaybackVisibility: () => void;
    syncThumbnailVisibility: (value: boolean) => void;
    applyExperimentalPlaybackStorageValues: () => void;
    applyExperimentalPlaybackToggleValues: () => void;
    afterThumbnailStorageApply: (previousValue: boolean, nextValue: boolean) => void;
    afterThumbnailToggleChange: () => void;
  }): {
    pagePlaybackBehaviorDefinitions: PlaybackSettingDefinition[];
    experimentalPlaybackVisibilityDefinition: PlaybackSettingDefinition;
    thumbnailVisibilityDefinition: PlaybackSettingDefinition;
    playbackSettingDefinitions: PlaybackSettingDefinition[];
  };
}

declare module "../lib/playback-settings/value-reducer.mjs?*" {
  export function isPagePlaybackBehaviorDefinition(definition: PlaybackSettingDefinition): boolean;
  export function createInitialPlaybackBehaviorPageValues(
    definitions: PlaybackSettingDefinition[]
  ): Map<string, boolean>;
  export function getPlaybackBehaviorEffectiveValue(
    definition: PlaybackSettingDefinition,
    experimentalEnabled: boolean,
    pageValues: Map<string, boolean>
  ): boolean;
  export function reducePlaybackSettingChange(input: {
    definition: PlaybackSettingDefinition;
    currentValue: boolean;
    nextValue: boolean;
    experimentalEnabled: boolean;
    pageValues: Map<string, boolean>;
  }): {
    previousValue: boolean;
    nextValue: boolean;
    changed: boolean;
    pageValues: Map<string, boolean>;
  };
}

declare module "../lib/youtube/playback-start-attempt.mjs?*" {
  export const YOUTUBE_PLAYBACK_START_STATUS: {
    readonly STARTED: "started";
    readonly FAILED: "failed";
    readonly UNCONFIRMED: "unconfirmed";
  };
  export function createYoutubePlaybackStartResult(status: string): { status: string };
  export function createYoutubePlaybackStartAttemptManager(input: {
    getSharedPlaybackState: () => YoutubeSharedPlaybackState;
    getThumbForSession: (sessionId: number) => HTMLElement | null;
    getSessionIdForThumb: (thumbDiv: Element | null | undefined) => number;
    isCurrentSession: (thumbDiv: Element | null | undefined, sessionId: number) => boolean;
    handleStartFailure: (
      thumbDiv: HTMLElement,
      options?: {
        playbackMode?: string;
        reason?: string;
        errorCode?: unknown;
        sessionId?: number;
        wasPlaybackStartUnconfirmed?: boolean;
      }
    ) => void;
    markUnconfirmedStart: (sessionId: number) => void;
    clearUnconfirmedStart: (sessionId?: number) => boolean;
    timeoutMs?: number;
    setupTimeoutMs?: number;
  }): {
    create: (
      sessionId: number,
      inputContext?: { thumbDiv?: HTMLElement | null; playbackMode?: string }
    ) => Promise<{ status: string }>;
    armStartTimeout: (sessionId: number) => boolean;
    settle: (sessionId: number | undefined, playbackResult: { status: string }) => boolean;
    cancelForThumb: (thumbDiv: Element | null | undefined) => boolean;
  };
  export function isYoutubePlaybackStarted(result: unknown): boolean;
  export function isYoutubePlaybackStartUnconfirmed(result: unknown): boolean;
}

declare module "../lib/youtube/embed.mjs?*" {
  export function applyYoutubePlayerIframeAttributes(iframe: Element | null | undefined): void;
  export function buildYoutubeEmbedUrl(
    yt: YoutubeTarget,
    options?: { endSeconds?: number | null; autoplay?: boolean }
  ): string;
  export function createYoutubeIframeApiLoader(input: {
    youtube: AppYoutubeRuntimeState;
    iframeApiSrc: string;
    iframeApiSelector: string;
    readyPollMs: number;
  }): {
    ensureReady: () => Promise<void>;
  };
}

declare module "../lib/youtube/shared-playback.mjs?*" {
  export function destroyYoutubeSharedPlayback(input: {
    youtube: AppYoutubeRuntimeState;
    syncIframe?: () => HTMLIFrameElement | null;
    debug?: (message: string, details?: unknown) => void;
  }): void;
  export function ensureYoutubeSharedPlaybackElements(input: {
    youtube: AppYoutubeRuntimeState;
    syncIframe: () => HTMLIFrameElement | null;
    createFrame: () => HTMLIFrameElement | null;
    createCloseButton: () => HTMLButtonElement | null;
  }): YoutubeSharedPlaybackState;
  export function getYoutubeSharedPlaybackState(youtube: AppYoutubeRuntimeState): YoutubeSharedPlaybackState;
  export function getYoutubeSharedPlaybackThumb(youtube: AppYoutubeRuntimeState, sessionId: number): HTMLElement | null;
  export function setPendingYoutubeSharedPlaybackAttach(
    youtube: AppYoutubeRuntimeState,
    iframe: HTMLIFrameElement | null | undefined,
    playbackSessionId: number
  ): void;
  export function setYoutubeSharedPlaybackSessionId(youtube: AppYoutubeRuntimeState, sessionId: number): void;
  export function syncYoutubeSharedPlaybackIframe(youtube: AppYoutubeRuntimeState): HTMLIFrameElement | null;
}

declare module "../lib/youtube/thumbnail.mjs?*" {
  export function applyYoutubeThumbnailImage(
    thumbDiv: HTMLElement,
    videoId: string,
    options?: { eager?: boolean }
  ): void;
  export function createYoutubeThumbnailImage(videoId: string): HTMLImageElement | null;
  export function getSongKeyFromYoutubeThumb(thumbDiv: Element | null | undefined): string;
  export function revealYoutubePlaybackCardIfNeeded(thumbDiv: Element | null | undefined): void;
  export function setYoutubeThumbnailExpandedCardState(thumbDiv: Element | null | undefined, isExpanded: boolean): void;
  export function setYoutubeThumbnailOrientation(thumbDiv: HTMLElement, orientation: string): void;
  export function setYoutubeThumbnailPlaybackState(thumbDiv: HTMLElement, state: string): void;
  export function shouldLoadYoutubeThumbnailNow(thumbDiv: HTMLElement): boolean;
}

declare module "../lib/youtube/playback-state.mjs?*" {
  export function createYoutubePlaybackState(): YoutubePlaybackRuntimeState;
  export function isYoutubePlaybackSessionActive(
    state: Pick<YoutubePlaybackRuntimeState, "activeSessionId">,
    sessionId: number
  ): boolean;
  export function reduceYoutubePlaybackState(
    state: YoutubePlaybackRuntimeState,
    event: { type: string; sessionId?: number; preserveTransitionGeneration?: boolean }
  ): YoutubePlaybackRuntimeState;
}

declare module "../lib/youtube/unconfirmed-playback-start.mjs?*" {
  export function createYoutubeUnconfirmedPlaybackStartManager(input: {
    getSharedPlaybackState: () => YoutubeSharedPlaybackState;
  }): {
    mark: (sessionId: number) => void;
    clear: (sessionId?: number) => boolean;
    consume: (sessionId: number) => boolean;
  };
}

declare module "../lib/youtube/player-adapter.mjs?*" {
  export function createYoutubePlayerAdapter(input: {
    getSharedPlaybackState: () => YoutubeSharedPlaybackState;
    setPendingAttach: (iframe: HTMLIFrameElement | null | undefined, playbackSessionId: number) => void;
    setSessionId: (playbackSessionId: number) => void;
    ensureReady: () => Promise<void>;
    applyIframeAttributes: (iframe: Element | null | undefined) => void;
    syncIframe: () => HTMLIFrameElement | null;
    handleStateChange: (event: { data?: number; target?: YoutubePlayerLike }, playbackSessionId: number) => void;
    handlePlayerError: (event: { data?: number; target?: YoutubePlayerLike }, playbackSessionId: number) => void;
    handleAttachFailure?: (error: unknown, playbackSessionId: number) => YoutubePlayerLike | null;
    debug?: (message: string, details?: unknown) => void;
  }): {
    attach: (iframe: HTMLIFrameElement, playbackSessionId: number) => Promise<YoutubePlayerLike | null>;
  };
}

declare module "../lib/youtube-url.mjs?*" {
  export function extractYoutubeInfo(url?: string): YoutubeTarget;
}

declare module "../lib/storage/bookmark-schema.mjs?*" {
  export function buildStoredBookmarksPayload(
    bookmarks: Record<string, BookmarkRecord>,
    version: number
  ): { version: number; bookmarks: Record<string, BookmarkRecord> };
  export function parseStoredBookmarksPayload(raw: unknown): {
    version: number;
    bookmarks: Record<string, BookmarkRecord>;
  };
  export function migrateLegacyBookmarkSongRefsToCurrent(input: {
    bookmarks: Record<string, BookmarkRecord>;
    songRows: Song[];
  }): {
    updated: boolean;
    changedBookmarkIds: string[];
    changes: Array<{
      bookmarkId: string;
      before: Array<string | number>;
      after: string[];
    }>;
  };
}

declare module "../lib/storage/bookmark-transfer.mjs?*" {
  export function exportBookmarksAsJsonText(
    bookmarks: Record<string, BookmarkRecord>,
    version: number
  ): {
    ok: boolean;
    text: string;
    bookmarkCount: number;
    songCount: number;
  };
  export function parseBookmarkImportText(
    text: unknown,
    options: {
      songRows?: Song[];
      maxBookmarkCount?: number;
      maxSongsPerBookmark?: number;
      maxBookmarkNameLength?: number;
    }
  ): {
    ok: boolean;
    reason?: string;
    bookmarks?: Record<string, BookmarkRecord>;
    bookmarkCount?: number;
    songCount?: number;
    limit?: number;
    bookmarkName?: string;
  };
}

declare module "../lib/storage/search-state-schema.mjs?*" {
  export function buildStoredSearchStatePayload(input: {
    query?: string;
    relayOnly?: boolean;
    harmonyOnly?: boolean;
    collabHostOnly?: boolean;
    collabGuestOnly?: boolean;
    dateFrom?: string;
    dateTo?: string;
    formats?: string[];
  }): {
    version: number;
    query: string;
    relayOnly: boolean;
    harmonyOnly: boolean;
    collabHostOnly: boolean;
    collabGuestOnly: boolean;
    dateFrom: string;
    dateTo: string;
    formats: string[];
  };
  export function parseStoredSearchStatePayload(
    text: string,
    options?: { defaultFormats?: string[] }
  ): {
    version: number;
    query: string;
    relayOnly: boolean;
    harmonyOnly: boolean;
    collabHostOnly: boolean;
    collabGuestOnly: boolean;
    dateFrom: string;
    dateTo: string;
    formats: string[];
  };
}

declare module "../ui/date/filter.mjs?*" {
  export function createDateFilterController(input: { ui: DateUiElementsStateSource }): {
    getPartialDateRange(kind: string): SearchDateRange | null;
    hasDateSelection(): boolean;
    getDateSelectValue(kind: string): string;
    applyDateSelectValue(kind: string, value: string): void;
    resetDateSelects(): void;
    syncDateSelectOptions(kind?: string): void;
    applyPendingDateValues(): void;
    applyDateInputRange(rows: Song[]): SearchDateRange | null;
    clampDateInputsToBounds(minKey: DateKey, maxKey: DateKey): void;
    clampDateInputsIfNeeded(): void;
  };
}

declare module "../lib/search-filters.mjs?*" {
  export function filterSongsByCriteria<T extends Song>(
    rows: T[],
    searchState: SearchState,
    selectedFormats: Set<string>
  ): T[];
}

declare module "../lib/search-recommendation.mjs?*" {
  export function pickRecommendedSongs<T extends Song>(
    rows: T[],
    options: {
      count: number;
      minPerformanceCount: number;
    }
  ): T[];
}

declare module "../lib/search-boolean-filters.mjs?*" {
  export function collectSearchBooleanFilterState(ui: Pick<AppUiState, "el">): {
    collabHostOnly: boolean;
    collabGuestOnly: boolean;
    relayOnly: boolean;
    harmonyOnly: boolean;
  };
  export function hasSelectedSearchBooleanFilterState(searchState: SearchState): boolean;
}
