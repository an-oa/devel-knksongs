import assert from "node:assert/strict";

/** 各テストで独立した保存領域を持つ Storage のメモリ実装を作る。 */
export function createFakeLocalStorage(): Storage {
    const store = new Map<string, string>();
    return {
        /** 保存件数を返す。 */
        get length() { return store.size; },
        /** 挿入順で指定位置のキーを返す。 */
        key(index) { return Array.from(store.keys())[index] ?? null; },
        /** 未保存のキーには null を返す。 */
        getItem(key) { return store.get(key) ?? null; },
        /** 値を文字列として保存する。 */
        setItem(key, value) { store.set(key, String(value)); },
        /** 指定キーを削除する。 */
        removeItem(key) { store.delete(key); },
        /** 保存内容を空にする。 */
        clear() { store.clear(); }
    };
}

/** 保存済みの値があることを確認して返す。欠落した場合はテストを失敗させる。 */
export function readStoredText(storage: Pick<Storage, "getItem">, key: string): string {
    const text = storage.getItem(key);
    assert.ok(text !== null, `stored value ${key} is missing`);
    return text;
}
