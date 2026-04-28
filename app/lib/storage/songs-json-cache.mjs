const DEFAULT_DB_NAME = "knksongs";
const DEFAULT_STORE_NAME = "songsJsonCache";

/**
 * localStorage から文字列を安全に読み込む。
 * @param {string | undefined} key
 * @returns {string | null}
 */
function getLegacyCachedText(key) {
    if (!key) return null;
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.warn(`localStorageを読み込めませんでした: ${key}`, error);
        return null;
    }
}

/**
 * localStorage のキャッシュを安全に削除する。
 * @param {string | undefined} key
 */
function removeLegacyCachedText(key) {
    if (!key) return;
    try {
        localStorage.removeItem(key);
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
function waitForRequest(request) {
    return new Promise((resolve, reject) => {
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
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
}

/**
 * 曲データJSONキャッシュ用の IndexedDB を開く。
 * @param {{ dbName: string, storeName: string }} options
 * @returns {Promise<IDBDatabase>}
 */
function openSongsJsonCacheDatabase({ dbName, storeName }) {
    if (!canUseIndexedDb()) {
        return Promise.reject(new Error("IndexedDB is not available"));
    }
    return new Promise((resolve, reject) => {
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
 * IndexedDB へ曲データJSON文字列を保存するキャッシュストアを作成する。
 * @param {{ cacheKey: string, dbName?: string, storeName?: string }} options
 * @returns {{ getText: () => Promise<string | null>, setText: (value: string) => Promise<boolean>, removeText: () => Promise<void> }}
 */
export function createIndexedDbSongsJsonCacheStore(options) {
    const {
        cacheKey,
        dbName = DEFAULT_DB_NAME,
        storeName = DEFAULT_STORE_NAME
    } = options;

    /**
     * 曲データJSONキャッシュの object store を取得する。
     * @param {IDBTransactionMode} mode
     * @returns {Promise<{ db: IDBDatabase, transaction: IDBTransaction, store: IDBObjectStore }>}
     */
    async function openStore(mode) {
        const db = await openSongsJsonCacheDatabase({ dbName, storeName });
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
    function closeDb(db) {
        db.close();
    }

    return {
        async getText() {
            if (!cacheKey) return null;
            const { db, store } = await openStore("readonly");
            try {
                const record = await waitForRequest(store.get(cacheKey));
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
 * 旧localStorageキャッシュを非同期キャッシュへ移行する adapter を作成する。
 * @param {{
 *   cache: {
 *     getText: () => Promise<string | null>,
 *     setText: (value: string) => Promise<boolean>,
 *     removeText: () => Promise<void>
 *   },
 *   legacyKey?: string
 * }} options
 * @returns {{ getText: () => Promise<string | null>, setText: (value: string) => Promise<boolean>, removeText: () => Promise<void> }}
 */
export function createLegacyLocalStorageSongsJsonCacheAdapter(options) {
    const { cache, legacyKey } = options;

    /**
     * 旧localStorageキャッシュがあれば読み込み、非同期キャッシュへ移す。
     * @returns {Promise<string | null>}
     */
    async function getMigratedLegacyText() {
        const legacyCachedJson = getLegacyCachedText(legacyKey);
        if (!legacyCachedJson) return null;
        if (await setText(legacyCachedJson)) {
            removeLegacyCachedText(legacyKey);
        }
        return legacyCachedJson;
    }

    /**
     * 非同期キャッシュへ保存し、旧キャッシュが容量を圧迫している場合は削除後に再試行する。
     * @param {string} value
     * @returns {Promise<boolean>}
     */
    async function setText(value) {
        try {
            return await cache.setText(value);
        } catch (error) {
            console.warn("曲データJSONキャッシュを保存できませんでした", error);
            if (getLegacyCachedText(legacyKey)) {
                removeLegacyCachedText(legacyKey);
                try {
                    return await cache.setText(value);
                } catch (retryError) {
                    console.warn("曲データJSONキャッシュの再保存に失敗しました", retryError);
                }
            }
            return false;
        }
    }

    return {
        async getText() {
            try {
                const cachedJson = await cache.getText();
                if (cachedJson) return cachedJson;
            } catch (error) {
                console.warn("曲データJSONキャッシュを読み込めませんでした", error);
            }
            return getMigratedLegacyText();
        },
        setText,
        async removeText() {
            try {
                await cache.removeText();
            } catch (error) {
                console.warn("曲データJSONキャッシュを削除できませんでした", error);
            }
            removeLegacyCachedText(legacyKey);
        }
    };
}
