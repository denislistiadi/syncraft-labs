import { openDB, type IDBPDatabase } from "idb";

export const DB_PREFIX = "syncraft-labs_";
export const DB_VERSION = 3;
export const STATE_STORE = "state" as const;
export const STATE_ENTITIES_STORE = "state_entities" as const;
export const OUTBOX_STORE = "outbox" as const;
export const STATE_KEY = "current" as const;

export type SyncDB = IDBPDatabase<unknown>;

export async function openSyncDB(storageKey: string): Promise<SyncDB> {
  const dbName = `${DB_PREFIX}${storageKey}`;
  return openDB(dbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(STATE_ENTITIES_STORE)) db.createObjectStore(STATE_ENTITIES_STORE);
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
    },
  });
}

export function closeDB(db: SyncDB): void {
  db.close();
}
