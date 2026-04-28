const DEFAULT_DB_NAME = "knksongs";
const DEFAULT_STORE_NAME = "songsJsonCache";

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
