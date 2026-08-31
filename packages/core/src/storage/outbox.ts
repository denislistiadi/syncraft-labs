import type { SyncDB } from "./db.js";
import { OUTBOX_STORE } from "./db.js";
import type { OutboxEntry } from "../types.js";

export async function pushOutbox<T>(db: SyncDB, entry: OutboxEntry<T>): Promise<void> {
  await db.put(OUTBOX_STORE, entry);
}

export async function readOutbox<T>(db: SyncDB): Promise<readonly OutboxEntry<T>[]> {
  const entries = (await db.getAll(OUTBOX_STORE)) as OutboxEntry<T>[];
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

export async function countOutbox(db: SyncDB): Promise<number> {
  return db.count(OUTBOX_STORE);
}

export async function deleteOldestOutboxEntry<T>(db: SyncDB): Promise<OutboxEntry<T> | undefined> {
  const entries = (await db.getAll(OUTBOX_STORE)) as OutboxEntry<T>[];
  if (entries.length === 0) return undefined;
  entries.sort((a, b) => a.timestamp - b.timestamp);
  const oldest = entries[0]!;
  await db.delete(OUTBOX_STORE, oldest.id);
  return oldest;
}

export async function clearOutbox(db: SyncDB, ids: readonly string[]): Promise<void> {
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  const store = tx.objectStore(OUTBOX_STORE);
  await Promise.all([...ids.map((id) => store.delete(id)), tx.done]);
}
