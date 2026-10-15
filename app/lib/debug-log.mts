/** 検証時にだけ有効にする、window 上のデバッグ用フラグ。 */
type DebugFlagWindowKey =
    | "__KNK_DEBUG_YOUTUBE__"
    | "__KNK_AUTOPLAY_START_FALLBACK__"
    | "__KNK_DEBUG_BOOKMARK_MIGRATION__";

/**
 * デバッグ用のフラグが有効か返す。
 * window のフラグが true か、localStorage の指定キーが "true" のときに有効とする。
 * @param windowKey console から切り替える window のフラグ名
 * @param storageKey 再読み込み後も有効にしておくための localStorage のキー
 * @returns フラグが有効かどうか。保存領域を読めない場合は無効として扱う
 */
export function isDebugFlagEnabled(windowKey: DebugFlagWindowKey, storageKey: string): boolean {
    try {
        if (window[windowKey] === true) return true;
        return localStorage.getItem(storageKey) === "true";
    } catch {
        return false;
    }
}

/**
 * 接頭辞を付けてデバッグログを出力する。付加情報がなければ本文だけを出力する。
 * @param prefix ログの出どころを示す接頭辞
 * @param message ログ本文
 * @param details 付加情報
 */
export function writeDebugLog(prefix: string, message: string, details?: unknown): void {
    if (details === undefined) {
        console.debug(prefix, message);
        return;
    }
    console.debug(prefix, message, details);
}
