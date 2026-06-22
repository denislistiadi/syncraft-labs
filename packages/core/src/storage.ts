/**
 * @module @syncraft/core/storage
 *
 * IndexedDB persistence layer using the `idb` library.
 *
 * Architecture:
 * Each `storageKey` maps to its own IndexedDB database with two object stores:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  Database: "syncraft_{storageKey}"       │
 *   │                                          │
 *   │  ┌──────────────┐  ┌─────────────────┐  │
 *   │  │  state        │  │  outbox          │  │
 *   │  │  key: "current"│  │  key: entry.id   │  │
 *   │  │  value: T      │  │  value: OutboxE. │  │
 *   │  └──────────────┘  └─────────────────┘  │
 *   └─────────────────────────────────────────┘
 *
 * - `state` store: Single record keyed by "current". Holds the latest state.
 * - `outbox` store: One record per mutation, keyed by UUID. Append-only log.
 *
 * Why separate stores instead of one? The outbox needs to be iterable
 * (for syncing) while state is a single-key lookup. Different access
 * patterns warrant separate stores.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { OutboxEntry } from "./types.js";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Prefix for all Syncraft databases to avoid collisions. */
const DB_PREFIX = "syncraft_";

/** Current database schema version. Bump this when adding stores/indexes. */
const DB_VERSION = 1;

/** Object store name for the current state. */
const STATE_STORE = "state" as const;

/** Object store name for the outbox queue. */
const OUTBOX_STORE = "outbox" as const;

/** The single key used in the state store. */
const STATE_KEY = "current" as const;

// ─────────────────────────────────────────────────────────────
// Database Schema Type
// ─────────────────────────────────────────────────────────────

/**
 * We define a loose DB type here because idb's generic DB typing
 * expects compile-time knowledge of all stores and their value types.
 * Since our state type `T` is generic and determined at runtime,
 * we use `unknown` and cast at the call sites.
 */
type SyncDB = IDBPDatabase<unknown>;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Opens (or creates) an IndexedDB database for the given storage key.
 *
 * The database has two object stores:
 * - `state`: Holds the current state under the key "current"
 * - `outbox`: Holds pending mutations keyed by UUID
 *
 * @param storageKey - Unique identifier for this state slice.
 * @returns A promise resolving to the opened database handle.
 */
export async function openSyncDB(storageKey: string): Promise<SyncDB> {
  const dbName = `${DB_PREFIX}${storageKey}`;

  return openDB(dbName, DB_VERSION, {
    /**
     * Called when the database is first created or when DB_VERSION
     * is higher than the existing version. This is where we create
     * our object stores.
     */
    upgrade(db) {
      // State store: simple key-value (no auto-increment needed)
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE);
      }

      // Outbox store: keyed by the entry's UUID
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      }
    },
  });
}

/**
 * Read the current persisted state from IndexedDB.
 *
 * @template T - The shape of the state.
 * @param db - The opened database handle.
 * @returns The stored state, or `undefined` if nothing has been persisted yet.
 */
export async function readState<T>(db: SyncDB): Promise<T | undefined> {
  // The `get` method returns `undefined` if the key doesn't exist.
  // We cast from `unknown` to `T` because our DB type is loosely typed.
  const value = await db.get(STATE_STORE, STATE_KEY);
  return value as T | undefined;
}

/**
 * Write the current state to IndexedDB.
 *
 * Uses `put` (upsert) so it works for both initial writes and updates.
 * This is a fire-and-forget write — the in-memory cache is the primary
 * source of truth; IndexedDB is the durable backup.
 *
 * @template T - The shape of the state.
 * @param db - The opened database handle.
 * @param value - The state to persist.
 */
export async function writeState<T>(db: SyncDB, value: T): Promise<void> {
  await db.put(STATE_STORE, value, STATE_KEY);
}

/**
 * Append a new entry to the outbox queue.
 *
 * The outbox is an append-only log. Entries are only removed after
 * they've been successfully synced to the server via the `pusher`.
 *
 * @template T - The shape of the state.
 * @param db - The opened database handle.
 * @param entry - The outbox entry to persist.
 */
export async function pushOutbox<T>(
  db: SyncDB,
  entry: OutboxEntry<T>,
): Promise<void> {
  await db.put(OUTBOX_STORE, entry);
}

/**
 * Read all pending outbox entries.
 *
 * Returns entries in insertion order (IndexedDB preserves key order
 * for in-line keys, and UUIDs are random — but we don't rely on order).
 *
 * @template T - The shape of the state.
 * @param db - The opened database handle.
 * @returns All pending outbox entries.
 */
export async function readOutbox<T>(
  db: SyncDB,
): Promise<readonly OutboxEntry<T>[]> {
  const entries = await db.getAll(OUTBOX_STORE);
  return entries as OutboxEntry<T>[];
}

/**
 * Remove synced entries from the outbox by their IDs.
 *
 * Uses a transaction to delete multiple entries atomically.
 * If any ID doesn't exist, it's silently ignored (idempotent).
 *
 * @param db - The opened database handle.
 * @param ids - Array of outbox entry IDs to remove.
 */
export async function clearOutbox(
  db: SyncDB,
  ids: readonly string[],
): Promise<void> {
  // Use a single transaction for atomicity — either all deletes
  // succeed or none do. This prevents partial outbox corruption.
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  const store = tx.objectStore(OUTBOX_STORE);

  // Fire all deletes concurrently within the same transaction.
  await Promise.all([
    ...ids.map((id) => store.delete(id)),
    tx.done,
  ]);
}

/**
 * Close the database connection.
 *
 * Should be called when the store is destroyed to free resources.
 * After calling this, the db handle must not be used again.
 *
 * @param db - The database handle to close.
 */
export function closeDB(db: SyncDB): void {
  db.close();
}
