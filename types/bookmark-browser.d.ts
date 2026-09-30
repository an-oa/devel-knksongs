type SaveFilePickerFileHandle = {
  createWritable: () => Promise<{
    write: (contents: Blob | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

interface Window {
  /** ブックマーク参照移行のデバッグログを一時的に有効化するフラグ。 */
  __KNK_DEBUG_BOOKMARK_MIGRATION__?: boolean;
  /** File System Access API を使った保存 picker。 */
  showSaveFilePicker?: (options?: unknown) => Promise<SaveFilePickerFileHandle>;
}
