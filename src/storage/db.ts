// Ravel - storage layer.
//
// EVERYTHING in this file talks to IndexedDB, which lives entirely inside
// the browser profile on this device. There is no fetch(), no XHR, no
// websocket, nothing that leaves the machine - this file could not phone
// home even if it wanted to.

const DB_NAME = "ravel";
const DB_VERSION = 6;

export const STORES = {
  events: "activityEvents",
  settings: "settings",
  openTabs: "openTabs",
  spools: "spools",
} as const;

// Stores from earlier versions that are no longer used (Ghosts/Seeds/
// Collisions/attention analytics, the Groq narrative cache, and manual
// topic rename/merge hints were all dropped along with the features that
// wrote to them).
const RETIRED_STORES = ["topicClusters", "rabbitHoles", "ghosts", "patternInsights", "topicHints"];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      for (const name of RETIRED_STORES) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
      }

      if (!db.objectStoreNames.contains(STORES.events)) {
        const s = db.createObjectStore(STORES.events, { keyPath: "id" });
        s.createIndex("timestamp", "timestamp");
        s.createIndex("domain", "domain");
        s.createIndex("sessionId", "sessionId");
        s.createIndex("platform", "platform");
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
      // live open-tab tracking + archived Spools - the "ravel a thread"
      // rescue mechanic. openTabs is reconciled against chrome.tabs on every
      // startup (see background/serviceWorker.ts), never trusted to be
      // perfectly in sync on its own.
      if (!db.objectStoreNames.contains(STORES.openTabs)) {
        db.createObjectStore(STORES.openTabs, { keyPath: "tabId" });
      }
      if (!db.objectStoreNames.contains(STORES.spools)) {
        const s = db.createObjectStore(STORES.spools, { keyPath: "id" });
        s.createIndex("closedAt", "closedAt");
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export function put<T>(storeName: string, value: T): Promise<IDBValidKey> {
  return tx(storeName, "readwrite", (s) => s.put(value as any));
}

export function getAll<T>(storeName: string): Promise<T[]> {
  return tx(storeName, "readonly", (s) => s.getAll());
}

export function get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return tx(storeName, "readonly", (s) => s.get(key));
}

export function del(storeName: string, key: IDBValidKey): Promise<undefined> {
  return tx(storeName, "readwrite", (s) => s.delete(key)) as Promise<undefined>;
}

export function clearStore(storeName: string): Promise<undefined> {
  return tx(storeName, "readwrite", (s) => s.clear()) as Promise<undefined>;
}

/** Nukes every Ravel object store. Used by "Delete Everything". */
export async function deleteEverything(): Promise<void> {
  await Promise.all(Object.values(STORES).map((s) => clearStore(s)));
}

/** Returns the entire local dataset as a plain object, for the user's own export. */
export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const [key, storeName] of Object.entries(STORES)) {
    out[key] = await getAll(storeName);
  }
  return out;
}

/** Deletes events older than retentionDays. retentionDays <= 0 disables pruning. */
export async function pruneOldEvents(retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const all = await getAll<{ id: string; timestamp: number }>(STORES.events);
  const stale = all.filter((e) => e.timestamp < cutoff);
  for (const e of stale) await del(STORES.events, e.id);
  return stale.length;
}
