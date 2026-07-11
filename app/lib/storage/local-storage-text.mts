type LocalStorageTextReader = {
    getItem: (key: string) => string | null;
};

type LocalStorageTextWriter = {
    setItem: (key: string, value: string) => void;
};

type LocalStorageTextRemover = {
    removeItem: (key: string) => void;
};

/**
 * localStorage から文字列を安全に読み込む。
 */
export function getLocalStorageText(
    storage: LocalStorageTextReader | null | undefined,
    key: string | undefined
): string | null {
    if (!storage || !key) return null;
    try {
        return storage.getItem(key);
    } catch (error) {
        console.warn(`localStorageを読み込めませんでした: ${key}`, error);
        return null;
    }
}

/**
 * localStorage へ文字列を安全に保存する。
 */
export function setLocalStorageText(
    storage: LocalStorageTextWriter | null | undefined,
    key: string | undefined,
    value: string
): boolean {
    if (!storage || !key) return false;
    try {
        storage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn(`localStorageへ保存できませんでした: ${key}`, error);
        return false;
    }
}

/**
 * localStorage のキャッシュを安全に削除する。
 */
export function removeLocalStorageText(
    storage: LocalStorageTextRemover | null | undefined,
    key: string | undefined
): void {
    if (!storage || !key) return;
    try {
        storage.removeItem(key);
    } catch (error) {
        console.warn(`localStorageから削除できませんでした: ${key}`, error);
    }
}
