import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "mycelium-offline";
const DB_VERSION = 1;

export type SyncOp = {
  id?: number;
  clientUuid: string;
  url: string;
  method: string;
  body: string;
  createdAt: number;
  /** 0 = pending, 1 = synced. Stored as number because IDB index keys must be IDB-valid types. */
  synced: number;
  retries: number;
  lastError: string | null;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("syncQueue")) {
          const store = db.createObjectStore("syncQueue", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("synced", "synced");
          store.createIndex("clientUuid", "clientUuid", { unique: true });
        }
      },
    });
  }
  return dbPromise;
}
