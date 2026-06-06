/** 起動時に収集して ui.el に保持する DOM 要素キャッシュ。 */
type AppUiElements = Partial<{
  sidebar: HTMLElement | null;
  sidebarSheet: Element | null;
  sidebarHeader: Element | null;
  sidebarScrollArea: Element | null;
  sidebarOverlay: HTMLElement | null;
  mainContent: Element | null;
  openSidebarBtn: HTMLElement | null;
  closeSidebarBtn: HTMLElement | null;
  resultList: HTMLElement | null;
  resultCount: HTMLElement | null;
  loadMoreContainer: HTMLElement | null;
  loadMoreBtn: HTMLButtonElement | null;
  searchBox: HTMLInputElement | null;
  clearBtn: HTMLButtonElement | null;
  collabHostOnly: HTMLInputElement | null;
  collabGuestOnly: HTMLInputElement | null;
  relayOnly: HTMLInputElement | null;
  harmonyOnly: HTMLInputElement | null;
  dateFromYear: HTMLSelectElement | null;
  dateFromMonth: HTMLSelectElement | null;
  dateFromDay: HTMLSelectElement | null;
  dateToYear: HTMLSelectElement | null;
  dateToMonth: HTMLSelectElement | null;
  dateToDay: HTMLSelectElement | null;
  clearDateFromBtn: HTMLButtonElement | null;
  clearDateToBtn: HTMLButtonElement | null;
  themeToggle: HTMLInputElement | null;
  thumbToggle: HTMLInputElement | null;
  youtubeNoCookieToggle: HTMLInputElement | null;
  playArchiveToEndToggle: HTMLInputElement | null;
  continuousPlaybackToggle: HTMLInputElement | null;
  loopPlaybackToggle: HTMLInputElement | null;
  playbackSettingsGroup: HTMLElement | null;
  experimentalPlaybackSettingsGroup: HTMLElement | null;
  openSettingsPanelBtn: HTMLButtonElement | null;
  settingsSidebarPanel: HTMLElement | null;
  closeSettingsPanelBtn: HTMLButtonElement | null;
  closeSettingsSidebarBtn: HTMLButtonElement | null;
  formatsList: HTMLElement | null;
  openBookmarkPanelBtn: HTMLButtonElement | null;
  bookmarkSidebarPanel: HTMLElement | null;
  closeBookmarkPanelBtn: HTMLButtonElement | null;
  closeBookmarkSidebarBtn: HTMLButtonElement | null;
  bookmarkPanelCreate: HTMLElement | null;
  bookmarkPanelNewName: HTMLInputElement | null;
  bookmarkPanelError: HTMLElement | null;
  bookmarkPanelCreateBtn: HTMLButtonElement | null;
  bookmarkPanelExportBtn: HTMLButtonElement | null;
  bookmarkPanelImportBtn: HTMLButtonElement | null;
  bookmarkPanelImportInput: HTMLInputElement | null;
  bookmarkList: HTMLElement | null;
}> & Record<string, Element | null | undefined>;

/** 検索コントローラーが必須として扱う DOM 要素。 */
type SearchUiElements = {
  /** 検索語を入力するテキストボックス。 */
  searchBox: HTMLInputElement;
  /** 検索結果件数や表示状態を示す要素。 */
  resultCount?: HTMLElement | null;
};

/** 検索 UI の入力状態や派生キャッシュ。 */
type SearchUiRuntimeState = {
  /** 選択中の形式フィルタ。 */
  selectedFormats: Set<string>;
  /** 検索デバウンス用のタイマー ID。 */
  debounceId: number;
  /** 条件未指定時に表示するおすすめ曲のキャッシュ。 */
  recommendedCache: Song[] | null;
  /** 曲データ読み込みが完了して検索可能かどうか。 */
  dataReady: boolean;
  /** ユーザーが検索語を編集したかどうか。 */
  userTouchedQuery: boolean;
  /** ユーザーが検索フィルタを編集したかどうか。 */
  userTouchedFilters: boolean;
  /** 保存済み検索条件の復元処理が完了したかどうか。 */
  hasRestoredSearchState: boolean;
};

/** 曲データ読み込み前に一時保持する日付セレクト復元値。 */
type DateUiPendingValues = {
  /** 開始日側の `YYYY-MM-DD` 文字列。 */
  from: string | null;
  /** 終了日側の `YYYY-MM-DD` 文字列。 */
  to: string | null;
};

/** 日付フィルタ UI の境界値と選択肢生成用キャッシュ。 */
type DateUiRuntimeState = {
  /** 読み込み済み曲データから計算した選択可能日付範囲。 */
  bounds: SearchDateRange | null;
  /** `YYYY-MM` ごとの選択可能な日一覧。 */
  index: Map<string, number[]> | null;
  /** 日付セレクト初期化後に適用する保留値。 */
  pendingValues: DateUiPendingValues | null;
};

/** サムネイル表示と連続再生に関わる UI ランタイム状態。 */
type PlaybackUiRuntimeState = {
  /** サムネイルの遅延読み込みに使う IntersectionObserver。 */
  scrollObserver: IntersectionObserver | null;
  /** サムネイル画像を表示するかどうか。 */
  showThumbnails: boolean;
  /** 実験的な再生設定を表示するかどうか。 */
  showExperimentalPlaybackSettings: boolean;
  /** 埋め込み再生 URL に youtube-nocookie.com を使うかどうか。 */
  useYoutubeNoCookie: boolean;
  /** アーカイブ全体を曲の終了秒で止めずに再生するかどうか。 */
  playArchiveToEnd: boolean;
  /** 再生終了後に次の曲へ進むかどうか。 */
  continuousPlayback: boolean;
  /** 再生候補の末尾から先頭へ戻るかどうか。 */
  loopPlayback: boolean;
  /** 現在 iframe 再生を保持しているサムネイル要素。 */
  activeThumb: HTMLElement | null;
};

/** 再生設定 controller が扱う真偽値設定。 */
type PlaybackSettingsUiSlice = Pick<
  PlaybackUiRuntimeState,
  "showThumbnails" |
  "showExperimentalPlaybackSettings" |
  "useYoutubeNoCookie" |
  "playArchiveToEnd" |
  "continuousPlayback" |
  "loopPlayback"
>;

/** 再生設定トグルとして使う DOM 要素キー。 */
type PlaybackSettingElementKey =
  "thumbToggle" |
  "youtubeNoCookieToggle" |
  "playArchiveToEndToggle" |
  "continuousPlaybackToggle" |
  "loopPlaybackToggle";

/** 再生設定の保存範囲。 */
type PlaybackSettingScope = "persisted" | "page";

/** 再生設定の意味上の分類。 */
type PlaybackSettingKind = "visibility" | "behavior";

/** 再生設定 1 件の定義。 */
type PlaybackSettingDefinition = {
  scope: PlaybackSettingScope;
  kind: PlaybackSettingKind;
  stateKey: keyof PlaybackSettingsUiSlice;
  elementKey?: PlaybackSettingElementKey;
  storageKey?: string;
  defaultValue: boolean;
  hiddenValue?: boolean;
  effectiveWhenHidden?: boolean;
  interactive?: boolean;
  restoreActivePlaybackOnChange?: boolean;
};

/** ブックマーク参照や曲キー検索に使う派生マップ。 */
type LookupUiRuntimeState = {
  /** ブックマーク保存用キーから曲を引くマップ。 */
  songMapByBookmarkKey: Map<string, Song>;
  /** 現在の songKey から曲を引くマップ。 */
  songMapByKey: Map<string, Song>;
  /** 旧形式の sourceIndex から曲を引くマップ。 */
  songMapByLegacyIndex: Map<number, Song>;
  /** ルックアップマップの元になった曲配列参照。 */
  songLookupSourceRef: Song[] | null;
};

/** 検索結果カード 1 件を構成する DOM 要素一式。 */
type RenderCardEntry = {
  card: HTMLLIElement;
  thumbDiv: HTMLDivElement;
  content: HTMLElement;
  titleHeading: HTMLHeadingElement;
  titleEl: HTMLAnchorElement;
  artistEl: HTMLDivElement;
  dateEl: HTMLSpanElement;
  tagsEl: HTMLDivElement;
  actionBtn: HTMLButtonElement;
  dragHandle: HTMLDivElement;
};

/** 検索結果描画で再利用する DOM キャッシュ。 */
type RenderUiRuntimeState = {
  /** 曲の表示キーから既存カード DOM を引くマップ。 */
  cardEntriesBySourceKey: Map<string, RenderCardEntry>;
};

/** 設定パネルを閉じた後のフォーカス復帰先。 */
type SettingsPanelUiRuntimeState = {
  returnFocusEl: HTMLElement | null;
};

/** ブックマークパネルで未確定の追加操作。 */
type BookmarkPanelPendingAction = {
  /** 追加対象の曲キー。 */
  songKey: string;
} | null;

/** ブックマークパネルの操作状態とフォーカス復帰情報。 */
type BookmarkPanelUiRuntimeState = {
  /** ブックマーク選択待ちの曲追加操作。 */
  pendingAction: BookmarkPanelPendingAction;
  /** パネルを閉じた後のフォーカス復帰先。 */
  returnFocusEl: HTMLElement | null;
  /** パネル終了時にサイドバーも閉じるかどうか。 */
  exitClosesSidebar: boolean;
};

/** アプリ全体で共有する UI ランタイム状態。 */
type AppUiState = {
  /** DOM 要素キャッシュ。 */
  el: AppUiElements;
  /** 検索 UI の状態。 */
  search: SearchUiRuntimeState;
  /** 日付フィルタ UI の状態。 */
  date: DateUiRuntimeState;
  /** 再生 UI の状態。 */
  playback: PlaybackUiRuntimeState;
  /** 曲参照用の派生マップ。 */
  lookup: LookupUiRuntimeState;
  /** 検索結果描画用の DOM キャッシュ。 */
  render: RenderUiRuntimeState;
  /** 設定パネルの状態。 */
  settingsPanel: SettingsPanelUiRuntimeState;
  /** ブックマークパネルの状態。 */
  bookmarkPanel: BookmarkPanelUiRuntimeState;
};

/** 検索 UI slice を持つ入力 state。 */
type SearchUiStateSource = Pick<AppUiState, "search">;

/** 日付 UI slice を持つ入力 state。 */
type DateUiStateSource = Pick<AppUiState, "date">;

/** 再生 UI slice を持つ入力 state。 */
type PlaybackUiStateSource = Pick<AppUiState, "playback">;

/** 曲参照 lookup slice を持つ入力 state。 */
type LookupUiStateSource = Pick<AppUiState, "lookup">;

/** 描画 cache slice を持つ入力 state。 */
type RenderUiStateSource = Pick<AppUiState, "render">;

/** ブックマークパネル UI slice を持つ入力 state。 */
type BookmarkPanelUiStateSource = Pick<AppUiState, "bookmarkPanel">;

/** 設定パネル UI slice を持つ入力 state。 */
type SettingsPanelUiStateSource = Pick<AppUiState, "settingsPanel">;

/** DOM 要素 cache と検索 UI slice を持つ入力 state。 */
type SearchUiElementsStateSource = Pick<AppUiState, "el" | "search">;

/** DOM 要素 cache と日付 UI slice を持つ入力 state。 */
type DateUiElementsStateSource = Pick<AppUiState, "el" | "date">;
