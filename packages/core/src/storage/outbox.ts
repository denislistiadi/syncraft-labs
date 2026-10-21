import type { SyncDB } from "./db.js";
import { OUTBOX_STORE, OUTBOX_ARCHIVE_STORE } from "./db.js";
import type { OutboxEntry, ArchivedOutboxEntry } from "../types.js";

export async function pushOutbox<T>(db: SyncDB, entry: OutboxEntry<T>): Promise<void> {
  await db.put(OUTBOX_STORE, entry);
}

export async function readOutbox<T>(db: SyncDB, limit?: number): Promise<readonly OutboxEntry<T>[]> {
  const entries = (await db.getAll(OUTBOX_STORE, undefined, limit)) as OutboxEntry<T>[];
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

export async function archiveOutbox(db: SyncDB, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  if (!db.objectStoreNames.contains(OUTBOX_ARCHIVE_STORE)) {
    return clearOutbox(db, ids);
  }

  const tx = db.transaction([OUTBOX_STORE, OUTBOX_ARCHIVE_STORE], "readwrite");
  const outboxStore = tx.objectStore(OUTBOX_STORE);
  const archiveStore = tx.objectStore(OUTBOX_ARCHIVE_STORE);
  const now = Date.now();

  for (const id of ids) {
    const entry = (await outboxStore.get(id)) as OutboxEntry<unknown> | undefined;
    if (entry) {
      const archived: ArchivedOutboxEntry<unknown> = {
        ...entry,
        archivedAt: now,
        syncStatus: "synced",
      };
      await archiveStore.put(archived);
      await outboxStore.delete(id);
    }
  }

  await tx.done;
}

export async function readArchivedOutbox<T>(db: SyncDB, limit?: number): Promise<readonly ArchivedOutboxEntry<T>[]> {
  if (!db.objectStoreNames.contains(OUTBOX_ARCHIVE_STORE)) {
    return [];
  }
  const entries = (await db.getAll(OUTBOX_ARCHIVE_STORE, undefined, limit)) as ArchivedOutboxEntry<T>[];
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

export async function countArchivedOutbox(db: SyncDB): Promise<number> {
  if (!db.objectStoreNames.contains(OUTBOX_ARCHIVE_STORE)) {
    return 0;
  }
  return db.count(OUTBOX_ARCHIVE_STORE);
}

export async function clearArchivedOutbox(db: SyncDB, options?: { olderThan?: number }): Promise<number> {
  if (!db.objectStoreNames.contains(OUTBOX_ARCHIVE_STORE)) {
    return 0;
  }

  const tx = db.transaction(OUTBOX_ARCHIVE_STORE, "readwrite");
  const store = tx.objectStore(OUTBOX_ARCHIVE_STORE);
  const olderThan = options?.olderThan;

  if (olderThan === undefined) {
    const totalCount = await store.count();
    await store.clear();
    await tx.done;
    return totalCount;
  }

  const entries = (await store.getAll()) as ArchivedOutboxEntry<unknown>[];
  let deletedCount = 0;
  for (const entry of entries) {
    if (entry.archivedAt < olderThan) {
      await store.delete(entry.id);
      deletedCount++;
    }
  }

  await tx.done;
  return deletedCount;
}


