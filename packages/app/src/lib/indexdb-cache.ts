import {
  experimental_createQueryPersister,
  type AsyncStorage,
} from '@tanstack/react-query-persist-client';

const DB_NAME = 'tanstack-query-cache';
const STORE_NAME = 'queries';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Per-query IDB storage adapter for `experimental_createQueryPersister`.
 * Each query gets its own IDB entry keyed by query hash, so large benchmark
 * payloads don't block restoration of small queries like availability.
 */
export function createIDBStorage(): AsyncStorage {
  return {
    getItem: async (key: string) => {
      try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);
        return new Promise<string | null>((resolve) => {
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
        });
      } catch {
        return null;
      }
    },
    setItem: async (key: string, value: string) => {
      try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        await new Promise<void>((resolve) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      } catch {
        // Best-effort — silently fail (quota, private browsing)
      }
    },
    removeItem: async (key: string) => {
      try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        await new Promise<void>((resolve) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      } catch {
        // Best-effort
      }
    },
  };
}

const { persisterFn } = experimental_createQueryPersister({
  storage: createIDBStorage(),
  maxAge: Infinity,
});

/** Per-query IDB persister — pass to `useQuery({ persister: idbPersister })` */
export const idbPersister = persisterFn;

/** Clear all entries from the IDB query cache store. */
export async function clearIdbStore(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // best-effort
  }
}
