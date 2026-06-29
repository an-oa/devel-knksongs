/** `YYYYMMDD` を数値化した日付キー。 */
type DateKey = number;

/** 検索や日付 UI で扱う日付キーの範囲。 */
type SearchDateRange = {
  /** 範囲に含める最小日付キー。 */
  minKey: DateKey;
  /** 範囲に含める最大日付キー。 */
  maxKey: DateKey;
};

type SaveFilePickerFileHandle = {
  createWritable: () => Promise<{
    write: (contents: Blob | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

interface Window {
  /** ブックマーク参照移行のデバッグログを一時的に有効化するフラグ。 */
  __KNK_DEBUG_BOOKMARK_MIGRATION__?: boolean;
  /** E2E や手動検証から再生設定を切り替えるための console API。 */
  knkPlaybackSettings?: import("../app/controllers/playback-settings.mjs").PlaybackSettingsConsoleApi;
  /** YouTube 再生制御のデバッグログを一時的に有効化するフラグ。 */
  __KNK_DEBUG_YOUTUBE__?: boolean;
  /** 自動再生開始判定の fallback を検証時だけ有効化するフラグ。 */
  __KNK_AUTOPLAY_START_FALLBACK__?: boolean;
  /** File System Access API を使った保存 picker。 */
  showSaveFilePicker?: (options?: unknown) => Promise<SaveFilePickerFileHandle>;
  /** YouTube IFrame API が window に公開する namespace。 */
  YT: import("../app/state.types").YoutubeIframeApiGlobal;
  /** YouTube IFrame API の読み込み完了 callback。 */
  onYouTubeIframeAPIReady?: () => void;
}
