const DEFAULT_DB_NAME = "knksongs";
const DEFAULT_STORE_NAME = "songsJsonCache";

type TextCacheStore = {
    getText: () => Promise<string | null>;
    setText: (value: string) => Promise<boolean>;
    removeText: () => Promise<void>;
};

type TextCacheStoreOptions = {
    cacheKey: string;
    dbName?: string;
    storeName?: string;
};

type LegacyLocalStorageTextCacheAdapterOptions = {
    cache: TextCacheStore;
    legacyKey?: string;
    legacyKeys?: string[];
    storage?: {
        getItem: (key: string) => string | null;
        removeItem: (key: string) => void;
    } | null;
    label?: string;
    retrySetAfterRemovingLegacy?: boolean;
};

/**
 * @typedef {{
 *   getText: () => Promise<string | null>,
 *   setText: (value: string) => Promise<boolean>,
 *   removeText: () => Promise<void>
 * }} TextCacheStore
 */

/**
 * localStorage から文字列を安全に読み込む。
 * @param {{ getItem: (key: string) => string | null } | null | undefined} storage
 * @param {string | undefined} key
 * @returns {string | null}
 */
function getLegacyCachedText(storage, key) {
    if (!storage || !key) return null;
    try {
        return storage.getItem(key);
    } catch (error) {
        console.warn(`localStorageを読み込めませんでした: ${key}`, error);
        return null;
    }
}

/**
 * localStorage のキャッシュを安全に削除する。
 * @param {{ removeItem: (key: string) => void } | null | undefined} storage
 * @param {string | undefined} key
 */
function removeLegacyCachedText(storage, key) {
    if (!storage || !key) return;
    try {
        storage.removeItem(key);
    } catch (error) {
        console.warn(`localStorageから削除できませんでした: ${key}`, error);
    }
}

/**
 * IndexedDB が現在の実行環境で使えるか判定する。
 * @returns {boolean}
 */
function canUseIndexedDb() {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/**
 * IndexedDB のリクエストを Promise として待つ。
 * @param {IDBRequest} request
 * @returns {Promise<*>}
 */
function waitForRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
}

/**
 * IndexedDB のトランザクション完了を Promise として待つ。
 * @param {IDBTransaction} transaction
 * @returns {Promise<void>}
 */
function waitForTransaction(transaction) {
    return new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
}

/**
 * テキストキャッシュ用の IndexedDB を開く。
 * @param {{ dbName: string, storeName: string }} options
 * @returns {Promise<IDBDatabase>}
 */
function openTextCacheDatabase({
    dbName,
    storeName
}: { dbName: string, storeName: string }): Promise<IDBDatabase> {
    // テキストキャッシュ用の IndexedDB を開く。
    if (!canUseIndexedDb()) {
        return Promise.reject(new Error("IndexedDB is not available"));
    }
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "key" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
        request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    });
}

/**
 * IndexedDB へテキストを保存するキャッシュストアを作成する。
 * @param {{ cacheKey: string, dbName?: string, storeName?: string }} options
 * @returns {TextCacheStore}
 */
export function createIndexedDbTextCacheStore(options: TextCacheStoreOptions): TextCacheStore {
    // IndexedDB へテキストを保存するキャッシュストアを作成する。
    const {
        cacheKey,
        dbName = DEFAULT_DB_NAME,
        storeName = DEFAULT_STORE_NAME
    } = options;

    /**
     * テキストキャッシュの object store を取得する。
     * @param {IDBTransactionMode} mode
     * @returns {Promise<{ db: IDBDatabase, transaction: IDBTransaction, store: IDBObjectStore }>}
     */
    async function openStore(mode: IDBTransactionMode): Promise<{
        db: IDBDatabase,
        transaction: IDBTransaction,
        store: IDBObjectStore
    }> {
        // テキストキャッシュの object store を取得する。
        const db = await openTextCacheDatabase({ dbName, storeName });
        try {
            const transaction = db.transaction(storeName, mode);
            return {
                db,
                transaction,
                store: transaction.objectStore(storeName)
            };
        } catch (error) {
            db.close();
            throw error;
        }
    }

    /**
     * IndexedDB 接続を閉じる。
     * @param {IDBDatabase} db
     */
    function closeDb(db: IDBDatabase) {
        db.close();
    }

    return {
        async getText() {
            if (!cacheKey) return null;
            const { db, store } = await openStore("readonly");
            try {
                const record = await waitForRequest<{ value?: unknown } | undefined>(store.get(cacheKey));
                return typeof record?.value === "string" ? record.value : null;
            } finally {
                closeDb(db);
            }
        },
        async setText(value) {
            if (!cacheKey) return false;
            const { db, transaction, store } = await openStore("readwrite");
            try {
                store.put({
                    key: cacheKey,
                    value,
                    updatedAt: Date.now()
                });
                await waitForTransaction(transaction);
                return true;
            } finally {
                closeDb(db);
            }
        },
        async removeText() {
            if (!cacheKey) return;
            const { db, transaction, store } = await openStore("readwrite");
            try {
                store.delete(cacheKey);
                await waitForTransaction(transaction);
            } finally {
                closeDb(db);
            }
        }
    };
}

/**
 * IndexedDB へ曲データJSON文字列を保存するキャッシュストアを作成する。
 * 本番コードでは汎用の text cache と同じ実装を使い、既存 API 名の互換を保つために export している。
 * @param {{ cacheKey: string, dbName?: string, storeName?: string }} options
 * @returns {TextCacheStore}
 */
export function createIndexedDbSongsJsonCacheStore(options: TextCacheStoreOptions): TextCacheStore {
    // 既存 API 名から汎用 IndexedDB text cache を使う。
    return createIndexedDbTextCacheStore(options);
}

/**
 * localStorage に残っている旧キャッシュ key を順に返す。
 * @param {string | undefined} legacyKey
 * @param {string[] | undefined} legacyKeys
 * @returns {string[]}
 */
function getLegacyCacheKeys(legacyKey, legacyKeys) {
    // 旧単一 key 指定と複数 key 指定を同じ配列へ整える。
    return [legacyKey]
        .concat(Array.isArray(legacyKeys) ? legacyKeys : [])
        .filter((key, index, keys) => Boolean(key) && keys.indexOf(key) === index);
}

/**
 * localStorage の旧キャッシュ key から最初に見つかったテキストを返す。
 * @param {{ getItem: (key: string) => string | null } | null | undefined} storage
 * @param {string[]} legacyKeys
 * @returns {string | null}
 */
function getFirstLegacyCachedText(storage, legacyKeys) {
    // 現行 key、旧 key の順に移行元候補を探す。
    for (const key of legacyKeys) {
        const text = getLegacyCachedText(storage, key);
        if (text) return text;
    }
    return null;
}

/**
 * localStorage に残る旧キャッシュ key をまとめて削除する。
 * @param {{ removeItem: (key: string) => void } | null | undefined} storage
 * @param {string[]} legacyKeys
 */
function removeLegacyCachedTexts(storage, legacyKeys) {
    // 移行後に localStorage の容量を解放する。
    legacyKeys.forEach((key) => removeLegacyCachedText(storage, key));
}

/**
 * 旧 localStorage キャッシュを非同期 cache へ移行する汎用 adapter を作成する。
 * @param {{
 *   cache: TextCacheStore,
 *   legacyKey?: string,
 *   legacyKeys?: string[],
 *   storage?: {
 *     getItem: (key: string) => string | null,
 *     removeItem: (key: string) => void
 *   } | null,
 *   label?: string,
 *   retrySetAfterRemovingLegacy?: boolean
 * }} options
 * @returns {TextCacheStore}
 */
export function createLegacyLocalStorageTextCacheAdapter(
    options: LegacyLocalStorageTextCacheAdapterOptions
): TextCacheStore {
    // localStorage に残る大きな旧キャッシュを IndexedDB などの非同期 cache へ移す。
    const {
        cache,
        legacyKey,
        legacyKeys: rawLegacyKeys,
        storage = null,
        label = "テキストキャッシュ",
        retrySetAfterRemovingLegacy = false
    } = options;
    const legacyKeys = getLegacyCacheKeys(legacyKey, rawLegacyKeys);

    /**
     * 旧localStorageキャッシュがあれば読み込み、非同期キャッシュへ移す。
     * @returns {Promise<string | null>}
     */
    async function getMigratedLegacyText() {
        // 旧 localStorage キャッシュを互換読み込みして、保存成功時だけ削除する。
        const legacyCachedText = getFirstLegacyCachedText(storage, legacyKeys);
        if (!legacyCachedText) return null;
        try {
            if (await cache.setText(legacyCachedText)) {
                removeLegacyCachedTexts(storage, legacyKeys);
            }
        } catch (error) {
            console.warn(`${label}を保存できませんでした`, error);
        }
        return legacyCachedText;
    }

    /**
     * 非同期 cache へテキストを保存する。
     * @param {string} value
     * @returns {Promise<boolean>}
     */
    async function setText(value) {
        // 現行 cache へ保存し、成功後は旧 localStorage キャッシュを片付ける。
        try {
            const saved = await cache.setText(value);
            if (saved) removeLegacyCachedTexts(storage, legacyKeys);
            return saved;
        } catch (error) {
            console.warn(`${label}を保存できませんでした`, error);
            if (!retrySetAfterRemovingLegacy || !getFirstLegacyCachedText(storage, legacyKeys)) {
                return false;
            }
            removeLegacyCachedTexts(storage, legacyKeys);
            try {
                return await cache.setText(value);
            } catch (retryError) {
                console.warn(`${label}の再保存に失敗しました`, retryError);
                return false;
            }
        }
    }

    return {
        async getText() {
            // 現行 cache を優先し、なければ旧 localStorage から移行読み込みする。
            try {
                const cachedText = await cache.getText();
                if (cachedText) return cachedText;
            } catch (error) {
                console.warn(`${label}を読み込めませんでした`, error);
            }
            return getMigratedLegacyText();
        },
        setText,
        async removeText() {
            // 現行 cache と旧 localStorage キャッシュをまとめて削除する。
            try {
                await cache.removeText();
            } catch (error) {
                console.warn(`${label}を削除できませんでした`, error);
            }
            removeLegacyCachedTexts(storage, legacyKeys);
        }
    };
}

/**
 * 旧localStorageキャッシュを非同期キャッシュへ移行する adapter を作成する。
 * @param {{
 *   cache: {
 *     getText: () => Promise<string | null>,
 *     setText: (value: string) => Promise<boolean>,
 *     removeText: () => Promise<void>
 *   },
 *   legacyKey?: string,
 *   storage?: {
 *     getItem: (key: string) => string | null,
 *     removeItem: (key: string) => void
 *   } | null
 * }} options
 * @returns {{ getText: () => Promise<string | null>, setText: (value: string) => Promise<boolean>, removeText: () => Promise<void> }}
 */
export function createLegacyLocalStorageSongsJsonCacheAdapter(options) {
    // 旧localStorageキャッシュを非同期キャッシュへ移行する adapter を作成する。
    return createLegacyLocalStorageTextCacheAdapter({
        ...options,
        label: "曲データJSONキャッシュ",
        retrySetAfterRemovingLegacy: true
    });
}
