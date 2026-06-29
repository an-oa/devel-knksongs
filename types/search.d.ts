type SearchState = {
  queryRaw: string;
  dateFromKey: DateKey | null;
  dateToKey: DateKey | null;
  hasDateFilter: boolean;
  collabHostOnly?: boolean;
  collabGuestOnly?: boolean;
  relayOnly?: boolean;
  harmonyOnly?: boolean;
};

type SearchUiState = {
  el: import("../app/state.types").AppUiElements;
  search: import("../app/state.types").SearchUiRuntimeState;
  date: import("../app/state.types").DateUiRuntimeState;
  lookup: import("../app/state.types").LookupUiRuntimeState;
};

type SearchFiltersController = {
  areAllFormatsSelected: () => boolean;
  areFormatsDefault: () => boolean;
};

type SearchControllerCallbacks = {
  updateDisplay: () => void;
  scrollResultsPaneToTop: () => void;
};

type SearchDataState = import("../app/state.types").AppDataState;

type SearchConstants = {
  RANDOM_DISPLAY_COUNT: number;
  MIN_PERFORMANCE_FOR_RANDOM: number;
  RESULT_DISPLAY_BATCH_SIZE: number;
  SEARCH_DEBOUNCE_MS: number;
  DEFAULT_FORMATS?: string[];
};

type SearchInput = {
  searchState: SearchState;
  resultCountEl?: HTMLElement | null;
};

type SearchOutcome = {
  results: Song[];
  displayLimit: number;
  label: string;
};

type SearchControllerInput = {
  data: SearchDataState;
  ui: SearchUiState;
  searchFiltersController: SearchFiltersController;
  constants: SearchConstants;
  callbacks: SearchControllerCallbacks;
};
