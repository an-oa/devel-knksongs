type CacheBusterPlaybackStartResult = { status: string };

type CacheBusterYoutubeTarget = {
  videoId: string;
  startSeconds: number;
  endSeconds?: number | null;
  isVertical: boolean;
};

type YoutubeTarget = CacheBusterYoutubeTarget;

type CacheBusterTextCache = {
  getText: () => Promise<string | null>;
  setText: (value: string) => Promise<boolean>;
  removeText: () => Promise<void>;
};

type CacheBusterSongsDataSourceResult = {
  songs: unknown[];
  source: string;
  resetConditions?: boolean;
};

type CacheBusterPlaybackSettingsSnapshot = {
  showThumbnails: boolean;
  showExperimentalPlaybackSettings: boolean;
  playArchiveToEnd: boolean;
  continuousPlayback: boolean;
  loopPlayback: boolean;
};

type CacheBusterPlaybackSettingsConsoleApi = {
  setExperimentalPlaybackSettings: (value: boolean) => boolean;
  readonly showExperimentalPlaybackSettings: boolean;
  readonly state: CacheBusterPlaybackSettingsSnapshot;
};

type CacheBusterSearchController = {
  scheduleSearch: (options?: { immediate?: boolean }) => void;
  search: () => void;
  getSearchState: () => SearchState;
  isRecommendedMode: (searchState: SearchState) => boolean;
  areAllFormatsSelected: () => boolean;
  areFormatsDefault: () => boolean;
  hasDateSelection: () => boolean;
  getDateSelectValue: (kind: string) => string | null;
  applyDateSelectValue: (kind: string, value: string | null) => void;
  resetDateSelects: () => void;
  getPartialDateRange: (kind: string) => SearchDateRange | null;
  syncDateSelectOptions: (kind?: string) => void;
  applyPendingDateValues: () => void;
  applyDateInputRange: (songs: unknown[]) => SearchDateRange | null;
  clampDateInputsToBounds: (minKey: number, maxKey: number) => void;
  clampDateInputsIfNeeded: () => void;
};

type CacheBusterSearchControllerInput = {
  data: AppDataState;
  ui: AppUiState;
  searchFiltersController: CacheBusterSearchFiltersController;
  constants: {
    RANDOM_DISPLAY_COUNT: number;
    MIN_PERFORMANCE_FOR_RANDOM: number;
    RESULT_DISPLAY_BATCH_SIZE: number;
    SEARCH_DEBOUNCE_MS: number;
    DEFAULT_FORMATS: string[];
  };
  callbacks: {
    updateDisplay: () => void;
    scrollResultsPaneToTop: () => void;
  };
};

type CacheBusterRenderController = {
  playSongByKey: (songKey: string) => Promise<CacheBusterPlaybackStartResult>;
  scrollSongIntoView: (songKey: string) => void;
  updateDisplay: () => void;
  refreshLayout: () => void;
};

type CacheBusterRenderControllerInput = {
  data: AppDataState;
  ui: AppUiState;
  isAllFormatsSelected: () => boolean;
  resultDisplayBatchSize?: number;
  callbacks: {
    getSearchState: () => SearchState;
    isRecommendedMode: (state: SearchState) => boolean;
    updateThumbnail: (thumbDiv: HTMLElement, yt: CacheBusterYoutubeTarget) => void;
    extractYoutubeInfo: (url?: string) => CacheBusterYoutubeTarget;
    playThumbnail: (
      thumbDiv: HTMLElement,
      yt: CacheBusterYoutubeTarget,
      options?: { playbackMode?: string; revealCard?: boolean }
    ) => Promise<CacheBusterPlaybackStartResult> | CacheBusterPlaybackStartResult;
    restoreActivePlayback: () => void;
    openBookmarkModal: (songKey: string) => void;
    setupScrollObserver: () => void;
    removeSongFromActiveBookmark: (songKey: string) => void;
    saveBookmarks: () => void;
  };
};

type CacheBusterPlaybackSessionController = {
  continuePlayback: (finishedSongKey: string) => Promise<boolean>;
};

type CacheBusterPlaybackSessionControllerInput = {
  data: Pick<AppDataState, "currentResults">;
  ui: Pick<AppUiState, "playback">;
  callbacks: {
    playSongByKey: (songKey: string) => Promise<CacheBusterPlaybackStartResult> | CacheBusterPlaybackStartResult;
    scrollSongIntoView: (songKey: string) => void;
  };
};

type CacheBusterPlaybackSettingsController = {
  setupPlaybackSettings: () => void;
  applyPlaybackSettingsFromStorage: () => void;
  setExperimentalPlaybackSettings: (value: boolean) => boolean;
  getPlaybackSettingsSnapshot: () => CacheBusterPlaybackSettingsSnapshot;
  createConsoleApi: () => CacheBusterPlaybackSettingsConsoleApi;
};

type CacheBusterPlaybackSettingsControllerInput = {
  ui: AppUiState;
  callbacks: {
    ensureThumbnailPlaybackReady: () => void;
    restoreActivePlayback: () => void;
    updateDisplay: () => void;
    setupScrollObserver: () => void;
  };
};

type CacheBusterYoutubeController = {
  setLayoutHook: (hook: () => void) => void;
  setPlaybackEndedHook: (hook: (payload: { songKey: string }) => void) => void;
  setPlaybackStartFailedHook: (
    hook: (payload: {
      songKey: string;
      playbackMode: string;
      wasPlaybackStartUnconfirmed?: boolean;
    }) => void
  ) => void;
  isIOSWebKit: () => boolean;
  ensureThumbnailPlaybackReady: () => void;
  setupScrollObserver: () => void;
  playThumbnail: (
    thumbDiv: HTMLElement,
    yt: CacheBusterYoutubeTarget,
    options?: { playbackMode?: string; revealCard?: boolean }
  ) => Promise<CacheBusterPlaybackStartResult>;
  updateThumbnail: (thumbDiv: HTMLElement, yt: CacheBusterYoutubeTarget) => void;
  restoreActivePlayback: () => void;
};

type CacheBusterYoutubeControllerInput = {
  ui: AppUiState;
  youtube: AppYoutubeRuntimeState;
  constants: {
    YT_IFRAME_API_SRC: string;
    YT_IFRAME_API_SELECTOR: string;
    YT_IFRAME_READY_POLL_MS: number;
    STOP_PLAYBACK_ON_SCROLL_OUT: boolean;
  };
};

type CacheBusterStorageController = {
  loadBookmarks: () => void;
  saveBookmarks: () => void;
  exportBookmarksAsJsonText: () => string;
  parseBookmarkImportText: (text: string) => unknown;
  importBookmarksFromJsonText: (text: string) => unknown;
  migrateLegacyBookmarkSongRefs: () => void;
  addSongToBookmark: (bookmarkId: string, songKey: string) => unknown;
  createBookmark: (name: string) => unknown;
  createBookmarkAndAdd: (name: string, songKey: string) => unknown;
  deleteBookmark: (bookmarkId: string) => unknown;
  renameBookmark: (bookmarkId: string, nextName: string) => unknown;
  saveSearchState: () => void;
  restoreSearchState: () => void;
  removeSongFromBookmark: (bookmarkId: string, songKey: string) => unknown;
};

type CacheBusterStorageControllerInput = {
  data: AppDataState;
  ui: AppUiState;
  searchFiltersController: CacheBusterSearchFiltersController;
  constants: {
    SEARCH_STATE_KEY: string;
    DEFAULT_FORMATS: string[];
    BOOKMARK_STORAGE_KEY: string;
    BOOKMARK_STORAGE_VERSION: number;
    MAX_BOOKMARK_COUNT: number;
    MAX_SONGS_PER_BOOKMARK: number;
    MAX_BOOKMARK_NAME_LENGTH: number;
  };
  callbacks: {
    getDateSelectValue: (kind: string) => string | null;
    applyPendingDateValues: () => void;
    renderBookmarks: () => void;
    scheduleSearch: (options?: { immediate?: boolean }) => void;
  };
};

type CacheBusterBookmarkUiController = {
  setupBookmarkHandlers: () => void;
  renderBookmarks: () => void;
  openBookmarkBrowser: (options?: { returnFocusEl?: HTMLElement | null }) => void;
  openBookmarkModal: (
    songKey: string,
    options?: { returnFocusEl?: HTMLElement | null; closeSidebarOnExit?: boolean }
  ) => void;
  closeBookmarkModal: (options?: { restoreFocus?: boolean }) => void;
  setActiveBookmark: (bookmarkId: string) => void;
  clearActiveBookmark: (options?: { skipSearch?: boolean }) => void;
  removeSongFromActiveBookmark: (songKey: string) => void;
};

type CacheBusterBookmarkUiControllerInput = {
  data: AppDataState;
  ui: AppUiState;
  callbacks: {
    clearSearchDebounce: () => void;
    scheduleSearch: (options?: { immediate?: boolean }) => void;
    onAddSongToBookmark: (bookmarkId: string, songKey: string) => unknown;
    onCreateBookmark: (bookmarkName: string) => unknown;
    onCreateBookmarkAndAdd: (bookmarkName: string, songKey: string) => unknown;
    onDeleteBookmark: (bookmarkId: string) => unknown;
    onRenameBookmark: (bookmarkId: string, newName: string) => unknown;
    onRemoveSongFromBookmark: (bookmarkId: string, songKey: string) => unknown;
    onExportBookmarks: () => string;
    onPreviewBookmarkImport: (text: string) => unknown;
    onImportBookmarksText: (text: string) => unknown;
    onRequestCloseSidebar: () => void;
  };
};

type CacheBusterSidebarController = {
  setupUIHandlers: () => void;
  openBookmarkModal: (
    songKey: string,
    options?: { returnFocusEl?: HTMLElement | null; closeSidebarOnExit?: boolean }
  ) => void;
  removeSongFromActiveBookmark: (songKey: string) => void;
  clearActiveBookmark: (options?: { skipSearch?: boolean }) => void;
  closeSidebarMenu: () => void;
};

type CacheBusterSidebarControllerInput = {
  data: Pick<AppDataState, "displayLimit">;
  ui: AppUiState;
  constants: { resultDisplayBatchSize: number };
  callbacks: {
    getBookmarkUiController: () => CacheBusterBookmarkUiController | null;
    isIOSWebKit: () => boolean;
    markFilterTouched: (options?: { immediate?: boolean }) => void;
    markQueryTouched: () => void;
    clampDateInputsIfNeeded: () => void;
    syncDateSelectOptions: (kind?: string) => void;
    resetDateSelectGroup: (kind: string) => void;
    updateDisplay: () => void;
    clearSearch: () => void;
  };
};

type CacheBusterSearchFiltersController = {
  setupFilterOptions: (options?: {
    onFilterChange?: ((event: Event) => void) | ((options?: { immediate?: boolean }) => void);
  }) => void;
  renderFilterOptions: (options?: {
    onFormatChange?: ((event: Event) => void) | ((options?: { immediate?: boolean }) => void);
  }) => void;
  getSelectedFormatValues: () => string[];
  setSelectedFormatsToDefault: () => void;
  applySelectedFormats: (value: unknown) => void;
  syncFormatCheckboxesFromState: () => void;
  areAllFormatsSelected: () => boolean;
  areFormatsDefault: () => boolean;
  applyStoredFilterState: (payload: Record<string, unknown>) => void;
  resetFiltersToDefault: (options?: { resetDateSelects?: () => void }) => void;
  needsFilterReset: (options?: { hasDateSelection?: () => boolean }) => boolean;
};

type CacheBusterSearchFiltersControllerInput = {
  ui: AppUiState;
  defaultFormats?: string[];
};

type CacheBusterUiSyncController = {
  scheduleSyncUiState: (options?: { visual?: boolean; search?: boolean }) => void;
  scheduleDelayedVisualSync: (delayMs?: number) => void;
  setupSyncEvents: () => void;
};

type CacheBusterUiSyncControllerInput = {
  uiSyncPasses: number;
  syncSearchUI: (options?: { visual?: boolean; search?: boolean }) => void;
  applyThemeFromStorage: () => void;
  applyPlaybackSettingsFromStorage: () => void;
};

type CacheBusterDataLoader = {
  loadInitialData: () => Promise<void>;
};

type CacheBusterDataLoaderInput = {
  data: AppDataState;
  ui: AppUiState;
  dataSource: CacheBusterSongsDataSource;
  callbacks: {
    migrateLegacyBookmarkSongRefs: () => void;
    applyDateInputRange: (songs: unknown[]) => SearchDateRange | null;
    clampDateInputsToBounds: (minKey: number, maxKey: number) => void;
    resetSearchConditions: (shouldSearch: boolean) => void;
    scheduleSearch: (options?: { immediate?: boolean }) => void;
  };
};

type CacheBusterSongsDataSource = {
  loadInitialSongs: (callbacks: {
    onSongsLoaded: (result: CacheBusterSongsDataSourceResult) => void;
  }) => Promise<boolean>;
};

type CacheBusterSongsDataSourceInput = {
  publicSongsJsonUrl: string;
  publicSongsMetaUrl: string;
  publicCsvUrl: string;
  songsJsonCache: CacheBusterTextCache;
  storage: Storage | null;
  csvCacheKey: string;
  legacyCsvCacheKeys: string[];
};

type CacheBusterBrowserSongsDataSourceInput = {
  publicSongsJsonUrl: string;
  publicSongsMetaUrl: string;
  publicCsvUrl: string;
  songsJsonCacheKey: string;
  csvCacheKey: string;
  legacyCsvCacheKey: string;
};

type CacheBusterIndexedDbSongsJsonCacheStoreInput = {
  cacheKey: string;
};

type CacheBusterLegacyLocalStorageSongsJsonCacheAdapterInput = {
  cache: CacheBusterTextCache;
  legacyKey?: string;
  storage?: Storage | null;
};

interface Window {
  knkPlaybackSettings?: CacheBusterPlaybackSettingsConsoleApi;
  __KNK_DEBUG_YOUTUBE__?: boolean;
  __KNK_AUTOPLAY_START_FALLBACK__?: boolean;
  showSaveFilePicker?: (options?: unknown) => Promise<{
    createWritable: () => Promise<{
      write: (contents: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

declare module "./stream-role.mjs?*" {
  export const STREAM_ROLE_HOST: string;
  export const STREAM_ROLE_GUEST: string;
  export function normalizeStreamRole(value: unknown): string;
  export function hasStreamRole(value: unknown): boolean;
  export function isGuestStreamRole(value: unknown): boolean;
}

declare module "./date-key.mjs?*" {
  export function parseDateKey(value: unknown): DateKey | null;
  export function splitDateKey(value: DateKey | null | undefined): {
    year: string;
    month: string;
    day: string;
  } | null;
  export function dateKeyToParts(key: DateKey): { year: number; month: number; day: number };
  export function isWithinDateRange(
    row: { dateKey?: DateKey | null },
    minKey?: DateKey | null,
    maxKey?: DateKey | null
  ): boolean;
}

declare module "../../lib/date-key.mjs?*" {
  export function parseDateKey(value: unknown): DateKey | null;
  export function splitDateKey(value: DateKey | null | undefined): {
    year: string;
    month: string;
    day: string;
  } | null;
  export function dateKeyToParts(key: DateKey): { year: number; month: number; day: number };
  export function isWithinDateRange(
    row: { dateKey?: DateKey | null },
    minKey?: DateKey | null,
    maxKey?: DateKey | null
  ): boolean;
}

declare module "./search-filters.mjs?*" {
  export function normalizeForSearch(value: unknown): string;
  export function filterSongsByCriteria(
    songs: Song[],
    searchState: SearchState,
    selectedFormats: Set<string>
  ): Song[];
}

declare module "./youtube-url.mjs?*" {
  export function extractYoutubeInfo(url?: string): CacheBusterYoutubeTarget;
}

declare module "./dom-utils.mjs?*" {
  export function canUseDom(): boolean;
  export function getHeaderHeight(): number;
  export function isHtmlElement(value: unknown): value is HTMLElement;
}

declare module "../dom-utils.mjs?*" {
  export function canUseDom(): boolean;
  export function getHeaderHeight(): number;
  export function isHtmlElement(value: unknown): value is HTMLElement;
}

declare module "./layout-anchor.mjs?*" {
  export function afterAnimationFrames<T = unknown>(
    frameCount: number,
    callback?: () => T
  ): Promise<T | undefined>;
  export function afterLayoutSettled<T = unknown>(callback?: () => T): Promise<T | undefined>;
  export function findScrollableAncestor(element: Element | null | undefined): HTMLElement;
  export function createLayoutRefreshScheduler(
    getRefreshLayout: () => (() => void)
  ): (anchorElement?: Element | null) => Promise<boolean>;
}

declare module "./definitions.mjs?*" {
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
  export function createPlaybackSettingDefinitions(): {
    pagePlaybackBehaviorDefinitions: PlaybackSettingDefinition[];
    experimentalPlaybackVisibilityDefinition: PlaybackSettingDefinition;
    thumbnailVisibilityDefinition: PlaybackSettingDefinition;
    playbackSettingDefinitions: PlaybackSettingDefinition[];
  };
}

declare module "./song-format.mjs?*" {
  export function isOriginalSongFormat(format: unknown): boolean;
  export function isUtamitaEquivalentFormat(format: unknown): boolean;
  export function isStreamFormat(format: unknown): boolean;
  export function isShortFormat(format: unknown): boolean;
  export function matchesSelectedFormat(format: unknown, selectedFormats: Set<string>): boolean;
}

declare module "./csv-parser.mjs?*" {
  export function parseCsvToSongs(csvText: string): Song[];
}

declare module "./songs-json.mjs?*" {
  export function buildSongsJsonPayload(songs: Song[]): { schemaVersion: number; contentHash: string; songs: Song[] };
  export function buildSongsJsonMetaPayload(contentHash: string): { schemaVersion: number; contentHash: string };
  export function parseSongsJsonPayload(text: string): { contentHash: string; songs: Song[] };
  export function parseSongsJsonMetaPayload(text: string): { contentHash: string };
}

declare module "./bookmark-schema.mjs?*" {
  export function sanitizeBookmarks(raw: unknown): Record<string, BookmarkRecord>;
  export function parseStoredBookmarksPayload(raw: unknown): { version: number; bookmarks: Record<string, BookmarkRecord> };
  export function buildStoredBookmarksPayload(
    bookmarks: Record<string, BookmarkRecord>,
    version: number
  ): { version: number; bookmarks: Record<string, BookmarkRecord> };
  export function normalizeLegacySongRefToCurrent(ref: string | null | undefined): string | null;
  export function migrateLegacyBookmarkSongRefsToCurrent(input: {
    bookmarks: Record<string, BookmarkRecord>;
    songRows: Array<Partial<Song>>;
  }): {
    updated: boolean;
    changedBookmarkIds: string[];
    changes: Array<{ bookmarkId: string; before: Array<string | number>; after: string[] }>;
  };
}

declare module "../playback-debug.mjs?*" {
  export function debugPlayback(scope: string, message: string, details?: unknown): void;
  export function tracePlayback(scope: string, message: string, details?: unknown): void;
  export function isAutoplayStartFallbackEnabled(): boolean;
}

declare module "./embed.mjs?*" {
  export const YT_EMBED_HOST: string;
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
  }): { ensureReady: () => Promise<void> };
}

declare module "./thumbnail.mjs?*" {
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

declare module "../results-scroll.mjs?*" {
  export function scrollResultListToTop(resultList: Element | null | undefined): void;
  export function scheduleScrollElementIntoView(
    element: Element | null | undefined,
    options?: { topOffset?: number; behavior?: "auto" | "smooth"; force?: boolean }
  ): Promise<void>;
}

declare module "../../lib/ui-slices.mjs?*" {
  export function getDateUiState(ui: DateUiStateSource): DateUiRuntimeState;
  export function getPlaybackUiState(ui: PlaybackUiStateSource): PlaybackUiRuntimeState;
  export function getSearchUiState(ui: SearchUiStateSource): SearchUiRuntimeState;
  export function getLookupUiState(ui: LookupUiStateSource): LookupUiRuntimeState;
  export function getRenderUiState(ui: RenderUiStateSource): RenderUiRuntimeState;
  export function getBookmarkPanelUiState(ui: BookmarkPanelUiStateSource): BookmarkPanelUiRuntimeState;
  export function getSettingsPanelUiState(ui: SettingsPanelUiStateSource): SettingsPanelUiRuntimeState;
}

declare module "../../lib/search-boolean-filters.mjs?*" {
  export function applySearchBooleanFilterState(ui: unknown, payload: Record<string, unknown>): void;
  export function collectSearchBooleanFilterState(ui: unknown): Record<string, boolean>;
  export function getSearchBooleanFilterElements(ui: unknown): HTMLInputElement[];
  export function hasEnabledSearchBooleanFilter(ui: unknown): boolean;
  export function hasSelectedSearchBooleanFilterState(state: unknown): boolean;
  export function resetSearchBooleanFilters(ui: unknown): void;
}

declare module "./formats.mjs?*" {
  export function renderSearchFormatOptions(input: {
    searchUi: SearchUiRuntimeState;
    formatsList: Element | null | undefined;
    defaultFormats: string[];
    onChange?: (event: Event) => void;
  }): void;
  export function syncSearchFormatCheckboxes(input: {
    searchUi: Pick<SearchUiRuntimeState, "selectedFormats">;
    formatsList: Element | null | undefined;
  }): void;
}

declare module "../../lib/format-filter.mjs?*" {
  export function getFormatFilterLabel(format: string): string;
}

declare module "./import-export.mjs?*" {
  export function buildBookmarkExportFileName(date?: Date): string;
  export function buildBookmarkImportConfirmMessage(preview: unknown): string;
  export function getBookmarkImportErrorMessage(result: unknown): string;
  export function readFileText(file: File): Promise<string>;
  export function saveTextFile(text: string, filename: string): Promise<boolean>;
}

declare module "./popover.mjs?*" {
  export function createSidebarPopoverController(input: unknown): {
    show: () => boolean;
    scheduleHideAfterClose: () => void;
    clearPendingHide: () => void;
    setMainContentInert: (isInert: boolean) => void;
    syncExpandedState: (isExpanded: boolean) => void;
  };
}

declare module "./state.mjs?*" {
  export const RANDOM_DISPLAY_COUNT: number;
  export const MIN_PERFORMANCE_FOR_RANDOM: number;
  export const RESULT_DISPLAY_BATCH_SIZE: number;
  export const DEFAULT_FORMATS: string[];
  export const SEARCH_STATE_KEY: string;
  export const BOOKMARK_STORAGE_KEY: string;
  export const BOOKMARK_STORAGE_VERSION: number;
  export const MAX_BOOKMARK_COUNT: number;
  export const MAX_SONGS_PER_BOOKMARK: number;
  export const MAX_BOOKMARK_NAME_LENGTH: number;
  export const UI_SYNC_PASSES: number;
  export const SEARCH_DEBOUNCE_MS: number;
  export const YT_IFRAME_API_SRC: string;
  export const YT_IFRAME_API_SELECTOR: string;
  export const YT_IFRAME_READY_POLL_MS: number;
  export const STOP_PLAYBACK_ON_SCROLL_OUT: boolean;
  export const appState: AppState;
}

declare module "./config.mjs?*" {
  export const PUBLIC_SONGS_JSON_URL: string;
  export const PUBLIC_SONGS_META_URL: string;
  export const PUBLIC_CSV_URL: string;
  export const SONGS_JSON_CACHE_KEY: string;
  export const LEGACY_CSV_CACHE_KEY: string;
  export const CSV_CACHE_KEY: string;
}

declare module "./controllers/search.mjs?*" {
  export function createSearchController(input: CacheBusterSearchControllerInput): CacheBusterSearchController;
}

declare module "./controllers/render.mjs?*" {
  export function createRenderController(input: CacheBusterRenderControllerInput): CacheBusterRenderController;
}

declare module "./controllers/playback-session.mjs?*" {
  export function createPlaybackSessionController(
    input: CacheBusterPlaybackSessionControllerInput
  ): CacheBusterPlaybackSessionController;
}

declare module "./controllers/playback-settings.mjs?*" {
  export function createPlaybackSettingsController(
    input: CacheBusterPlaybackSettingsControllerInput
  ): CacheBusterPlaybackSettingsController;
}

declare module "./controllers/youtube.mjs?*" {
  export function extractYoutubeInfo(url?: string): CacheBusterYoutubeTarget;
  export function createYoutubeController(input: CacheBusterYoutubeControllerInput): CacheBusterYoutubeController;
}

declare module "./controllers/storage.mjs?*" {
  export function createStorageController(input: CacheBusterStorageControllerInput): CacheBusterStorageController;
}

declare module "./ui/bookmark/ui.mjs?*" {
  export function createBookmarkUiController(input: CacheBusterBookmarkUiControllerInput): CacheBusterBookmarkUiController;
}

declare module "./lib/results-scroll.mjs?*" {
  export function scrollResultListToTop(resultList: Element | null | undefined): void;
  export function scheduleScrollElementIntoView(
    element: Element | null | undefined,
    options?: { topOffset?: number; behavior?: "auto" | "smooth"; force?: boolean }
  ): Promise<void>;
}

declare module "./lib/ui-slices.mjs?*" {
  export function getDateUiState(ui: DateUiStateSource): DateUiRuntimeState;
  export function getPlaybackUiState(ui: PlaybackUiStateSource): PlaybackUiRuntimeState;
  export function getSearchUiState(ui: SearchUiStateSource): SearchUiRuntimeState;
  export function getLookupUiState(ui: LookupUiStateSource): LookupUiRuntimeState;
  export function getRenderUiState(ui: RenderUiStateSource): RenderUiRuntimeState;
  export function getBookmarkPanelUiState(ui: BookmarkPanelUiStateSource): BookmarkPanelUiRuntimeState;
  export function getSettingsPanelUiState(ui: SettingsPanelUiStateSource): SettingsPanelUiRuntimeState;
}

declare module "./lib/playback-debug.mjs?*" {
  export function debugPlayback(scope: string, message: string, details?: unknown): void;
  export function tracePlayback(scope: string, message: string, details?: unknown): void;
}

declare module "./ui/core/elements.mjs?*" {
  export function collectUiElements(): AppUiElements;
  export function applyDocumentTheme(isDarkMode: boolean): void;
  export function applyThemeFromStorage(input: { ui: { el: AppUiElements } }): void;
  export function setupTheme(input: { ui: { el: AppUiElements } }): void;
}

declare module "./ui/core/sync.mjs?*" {
  export function createUiSyncController(input: CacheBusterUiSyncControllerInput): CacheBusterUiSyncController;
}

declare module "./ui/core/data.mjs?*" {
  export function createDataLoader(input: CacheBusterDataLoaderInput): CacheBusterDataLoader;
}

declare module "./ui/core/data-source.mjs?*" {
  export function createBrowserSongsDataSource(
    input: CacheBusterBrowserSongsDataSourceInput
  ): CacheBusterSongsDataSource;
}

declare module "./ui/sidebar/ui.mjs?*" {
  export function createSidebarController(input: CacheBusterSidebarControllerInput): CacheBusterSidebarController;
}

declare module "./ui/search-filters/controller.mjs?*" {
  export function createSearchFiltersController(
    input: CacheBusterSearchFiltersControllerInput
  ): CacheBusterSearchFiltersController;
}

declare module "./lib/storage/songs-json-cache.mjs?*" {
  export function createIndexedDbSongsJsonCacheStore(
    options: CacheBusterIndexedDbSongsJsonCacheStoreInput
  ): CacheBusterTextCache;
  export function createLegacyLocalStorageSongsJsonCacheAdapter(
    options: CacheBusterLegacyLocalStorageSongsJsonCacheAdapterInput
  ): CacheBusterTextCache;
}

declare module "./lib/songs-data-source.mjs?*" {
  export function createSongsDataSource(input: CacheBusterSongsDataSourceInput): CacheBusterSongsDataSource;
}

declare module "../../lib/storage/songs-json-cache.mjs?*" {
  export function createIndexedDbSongsJsonCacheStore(
    options: CacheBusterIndexedDbSongsJsonCacheStoreInput
  ): CacheBusterTextCache;
  export function createLegacyLocalStorageSongsJsonCacheAdapter(
    options: CacheBusterLegacyLocalStorageSongsJsonCacheAdapterInput
  ): CacheBusterTextCache;
}

declare module "../../lib/songs-data-source.mjs?*" {
  export function createSongsDataSource(input: CacheBusterSongsDataSourceInput): CacheBusterSongsDataSource;
}

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
  export function createPlaybackSettingDefinitions(): {
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
