import {
    getBrowserLocalStorage,
    getLocalStorageText,
    removeLocalStorageText,
    setLocalStorageText
} from "./local-storage-text.mjs";

/** 保存設定を読み込み、失敗時は呼び出し元が既定値を使えるよう null を返す。 */
export function getStoredSettingText(key: string): string | null {
    return getLocalStorageText(getBrowserLocalStorage(), key);
}

/** 設定を保存する。失敗してもページ内の画面・再生への反映は継続する。 */
export function setStoredSettingText(key: string, value: string): boolean {
    return setLocalStorageText(getBrowserLocalStorage(), key, value);
}

/** 旧設定を削除し、失敗しても現在の設定の初期化を継続する。 */
export function removeStoredSetting(key: string): void {
    removeLocalStorageText(getBrowserLocalStorage(), key);
}
