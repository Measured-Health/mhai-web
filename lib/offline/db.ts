// The offline outbox's IndexedDB. Only lib/offline/ may use it (CONTRIBUTING).
const DB = "mhai-outbox";
type Store = "keys" | "items";

/** True if the outbox database exists (so reading never creates it). */
export async function outboxExists(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  if (!indexedDB.databases) return true; // can't tell: open it
  return (await indexedDB.databases()).some((d) => d.name === DB);
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("keys");
      req.result.createObjectStore("items", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  store: Store,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const idbGet = <T>(store: Store, key: IDBValidKey) =>
  run<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbAll = <T = unknown>(store: Store) =>
  run<T[]>(store, "readonly", (s) => s.getAll());
export const idbPut = async (
  store: Store,
  value: unknown,
  key?: IDBValidKey,
) => {
  await run(store, "readwrite", (s) => s.put(value, key));
};
export const idbDelete = async (store: Store, key: IDBValidKey) => {
  await run(store, "readwrite", (s) => s.delete(key));
};
