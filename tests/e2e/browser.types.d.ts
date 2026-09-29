// E2E専用の観測値・操作口。単体テストや本番のWindow型へは追加しない。
interface Window {
  __knkMockYoutube?: import("./support/youtube-iframe-api.mts").MockYoutubeControls;
  headerHiddenAtKeyboardFocusFrame?: boolean | null;
}
