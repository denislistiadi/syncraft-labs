import type { SyncDB } from "./db.js";
import { STATE_ENTITIES_STORE } from "./db.js";

export async function readCollectionState<T>(db: SyncDB): Promise<T | undefined> {
  const keys = await db.getAllKeys(STATE_ENTITIES_STORE);
  if (keys.length === 0) return undefined;
  const values = await db.getAll(STATE_ENTITIES_STORE);
  const result: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) result[String(keys[i])] = values[i];
  return result as T;
}

export async function writeCollectionEntities(
  db: SyncDB,
  updatedEntities: Record<string, unknown>,
  deletedKeys: readonly string[] = [],
): Promise<void> {
  const tx = db.transaction(STATE_ENTITIES_STORE, "readwrite");
  const store = tx.objectStore(STATE_ENTITIES_STORE);
  const promises: Promise<unknown>[] = [];
  for (const [key, value] of Object.entries(updatedEntities)) promises.push(store.put(value, key));
  for (const key of deletedKeys) promises.push(store.delete(key));
  promises.push(tx.done);
  await Promise.all(promises);
}

export async function writeCollectionState<T>(db: SyncDB, value: T): Promise<void> {
  const tx = db.transaction(STATE_ENTITIES_STORE, "readwrite");
  const store = tx.objectStore(STATE_ENTITIES_STORE);
  await store.clear();
  if (value && typeof value === "object") {
    const promises: Promise<unknown>[] = [];
    for (const [key, entity] of Object.entries(value as Record<string, unknown>)) promises.push(store.put(entity, key));
    promises.push(tx.done);
    await Promise.all(promises);
  } else {
    await tx.done;
  }
}
