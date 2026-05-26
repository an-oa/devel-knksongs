/** `YYYYMMDD` を数値化した日付キー。 */
type DateKey = number;

/** 検索や日付 UI で扱う日付キーの範囲。 */
type SearchDateRange = {
  /** 範囲に含める最小日付キー。 */
  minKey: DateKey;
  /** 範囲に含める最大日付キー。 */
  maxKey: DateKey;
};

/** localStorage に保存するブックマーク 1 件の内容。 */
type BookmarkRecord = {
  /** ユーザーが付けたブックマーク名。 */
  name: string;
  /** 曲を指す現在形式のキー、または旧形式の sourceIndex。 */
  songs: Array<string | number>;
  /** ブックマーク作成時刻。旧データでは存在しない場合がある。 */
  createdAt?: number;
};

/** アプリ全体で共有する曲データと検索結果の状態。 */
type AppDataState = {
  /** 読み込み済みの全曲データ。 */
  allSongsRaw: Song[];
  /** 現在の検索条件やブックマークで表示対象になっている曲データ。 */
  currentResults: Song[];
  /** 現在 DOM に表示する検索結果の上限件数。 */
  displayLimit: number;
  /** ブックマーク名をキーにした保存済みブックマーク。 */
  bookmarks: Record<string, BookmarkRecord>;
  /** 現在表示中のブックマーク名。通常検索時は null。 */
  activeBookmark: string | null;
};

/** YouTube IFrame API の Player として利用する最小限のメソッド。 */
type YoutubePlayerLike = {
  getIframe?: () => Element | null;
  getPlayerState?: () => number;
  stopVideo?: () => void;
  destroy?: () => void;
};

/** 共有プレーヤー初期化待ち中の最新 iframe 紐付け要求。 */
type YoutubeSharedPlaybackPendingAttach = {
  /** プレーヤー化する iframe。 */
  iframe: HTMLIFrameElement | null;
  /** iframe を紐付ける再生セッション ID。 */
  playbackSessionId: number;
};

/** YouTube 再生開始の成否待ちを表す状態。 */
type YoutubePlaybackStartAttempt = {
  /** 再生開始待ち対象のセッション ID。 */
  sessionId: number;
  /** 再生開始結果を呼び出し元へ返す Promise resolver。 */
  resolve: (result: { status: string }) => void;
  /** セットアップまたは再生開始待ちのタイマー ID。 */
  timeoutId: ReturnType<typeof setTimeout> | null;
  /** 失敗時の復元やログに使う再生開始コンテキスト。 */
  context: {
    thumbDiv?: Element | null;
    playbackMode?: string;
  };
};

/** 複数カード間で再利用する YouTube 共有 iframe / Player の状態。 */
type YoutubeSharedPlaybackState = {
  /** 共有 iframe に紐付いた YouTube Player。 */
  player: YoutubePlayerLike | null;
  /** Player 初期化中に共有する Promise。 */
  playerPromise: Promise<YoutubePlayerLike | null> | null;
  /** Player 初期化待ち中に処理する最新の iframe 紐付け要求。 */
  pendingAttach: YoutubeSharedPlaybackPendingAttach | null;
  /** 共有プレーヤーとして使う iframe。 */
  iframe: HTMLIFrameElement | null;
  /** 共有プレーヤーを閉じるボタン。 */
  closeButton: HTMLButtonElement | null;
  /** iframe をカード外へ退避するための隠しノード。 */
  parkingNode: HTMLElement | null;
  /** 現在共有プレーヤーを表示しているサムネイル。 */
  hostThumb: HTMLElement | null;
  /** 現在の共有プレーヤー再生セッション ID。 */
  sessionId: number;
  /** 再生開始待ち中の attempt。 */
  playbackStartAttempt: YoutubePlaybackStartAttempt | null;
  /** 再生開始が未確定のまま保持されているセッション ID。 */
  unconfirmedPlaybackStartSessionId: number;
};

/** YouTube API 読み込みと共有プレーヤーのランタイム状態。 */
type AppYoutubeRuntimeState = {
  /** YouTube IFrame API の読み込み Promise。 */
  apiPromise: Promise<unknown> | null;
  /** カード間で再利用する共有プレーヤー状態。 */
  sharedPlayback: YoutubeSharedPlaybackState | null;
};

type YoutubePlaybackRuntimeState = {
  sessionSequence: number;
  transitionGeneration: number;
  activeSessionId: number;
  phase: string;
};

type YoutubeIframeApiGlobal = {
  PlayerState: {
    PLAYING: number;
    PAUSED: number;
    ENDED: number;
  };
  Player: new (
    iframe: Element,
    options: {
      host?: string;
      events?: {
        onReady?: (event: { target?: YoutubePlayerLike }) => void;
        onStateChange?: (event: { data?: number; target?: YoutubePlayerLike }) => void;
        onError?: (event: { data?: number; target?: YoutubePlayerLike }) => void;
      };
    }
  ) => YoutubePlayerLike;
};

/** アプリ全体の状態ルート。 */
type AppState = {
  /** 曲データと検索結果の状態。 */
  data: AppDataState;
  /** UI と派生キャッシュの状態。 */
  ui: AppUiState;
  /** YouTube API と共有プレーヤーの状態。 */
  youtube: AppYoutubeRuntimeState;
};

interface Window {
  /** ブックマーク参照移行のデバッグログを一時的に有効化するフラグ。 */
  __KNK_DEBUG_BOOKMARK_MIGRATION__?: boolean;
  /** YouTube IFrame API が window に公開する namespace。 */
  YT: YoutubeIframeApiGlobal;
  /** YouTube IFrame API の読み込み完了 callback。 */
  onYouTubeIframeAPIReady?: () => void;
}
