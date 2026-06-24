/**
 * @module @syncraft/core/types
 *
 * Core type definitions for Syncraft.
 * All types are generic over `T` — the shape of the user's state.
 *
 * Design note: We use Immer's `Patch` type to capture granular diffs
 * of every mutation. This is overkill for Phase 1 but sets us up for
 * CRDT-based conflict resolution in Phase 2.
 */

import type { Patch } from "immer";

// ─────────────────────────────────────────────────────────────
// Store Configuration
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for creating a SyncStore instance.
 *
 * @template T - The shape of the state being synchronized.
 */
export interface SyncStoreConfig<T> {
  /**
   * Unique key used for the IndexedDB database name.
   * Each key gets its own isolated database with `state` and `outbox` stores.
   *
   * @example "todos", "user-profile", "settings"
   */
  readonly storageKey: string;

  /**
   * Optional initial state used when no persisted data exists.
   * If not provided, `get()` returns `undefined` until data is set.
   */
  readonly initialState?: T | undefined;

  /**
   * Maximum number of outbox entries allowed before `set()` throws.
   * Prevents unbounded outbox growth when the app is offline for
   * extended periods without syncing.
   *
   * @default 1000
   */
  readonly maxOutboxSize?: number | undefined;
}

// ─────────────────────────────────────────────────────────────
// Outbox Entry
// ─────────────────────────────────────────────────────────────

/**
 * Represents a single pending mutation in the outbox queue.
 * Each call to `store.set()` creates one of these entries.
 *
 * The outbox is an append-only log that survives page refreshes.
 * Framework wrappers (React/Vue) drain this queue by calling
 * a user-provided `pusher` function.
 */
export interface OutboxEntry<T> {
  /** Unique identifier for this mutation (UUID v4). */
  readonly id: string;

  /** Unix timestamp (ms) when the mutation was created. */
  readonly timestamp: number;

  /**
   * Immer patches describing exactly what changed.
   * Useful for future conflict resolution / operational transforms.
   */
  readonly patches: readonly Patch[];

  /**
   * Inverse patches that can undo this mutation.
   * Enables rollback if the server rejects the change.
   */
  readonly inversePatches: readonly Patch[];

  /**
   * Full state snapshot AFTER the mutation was applied.
   * Redundant with patches, but simplifies Phase 1 syncing
   * where we just send the latest state to the server.
   */
  readonly snapshot: T;
}

// ─────────────────────────────────────────────────────────────
// Subscriber / Listener
// ─────────────────────────────────────────────────────────────

/**
 * A callback invoked whenever the store's state changes.
 * Receives the new state value.
 */
export type SyncListener<T> = (state: T) => void;

/**
 * A function that, when called, removes the associated listener.
 */
export type Unsubscribe = () => void;

// ─────────────────────────────────────────────────────────────
// Updater Function
// ─────────────────────────────────────────────────────────────

/**
 * A function that receives an Immer draft and mutates it in place.
 * The draft is a proxy — mutations are captured and applied immutably.
 *
 * Two usage patterns are supported:
 *
 * **Mutate the draft** (most common):
 * @example
 * store.set((draft) => {
 *   draft.todos.push({ id: "1", text: "Buy milk", done: false });
 * });
 *
 * **Replace the entire state** (used by fetcher/refetch):
 * @example
 * store.set(() => freshDataFromServer);
 */
export type DraftUpdater<T> = (draft: T) => void | T;

// ─────────────────────────────────────────────────────────────
// SyncStore Interface
// ─────────────────────────────────────────────────────────────

/**
 * The core store interface returned by `createSyncStore<T>()`.
 *
 * Philosophy: The store is the single source of truth. It holds state
 * in memory for instant reads, persists to IndexedDB for durability,
 * and queues mutations in an outbox for eventual sync.
 */
export interface SyncStore<T> {
  /**
   * Get the current state.
   *
   * - Returns the in-memory cache if available (synchronous fast path).
   * - Falls back to reading from IndexedDB (async cold start).
   * - Returns `undefined` if no state has ever been set and no
   *   `initialState` was provided.
   *
   * The async nature is intentional — IndexedDB is always async.
   * Framework wrappers handle the hydration phase by showing a
   * loading state until the first read completes.
   */
  get(): Promise<T | undefined>;

  /**
   * Synchronous snapshot of the current in-memory state.
   * Returns `undefined` if the store hasn't hydrated yet.
   *
   * This is the fast path used by `useSyncExternalStore` in React
   * to avoid unnecessary async re-renders after hydration.
   */
  getSnapshot(): T | undefined;

  /**
   * Mutate the state using an Immer draft function.
   *
   * This method:
   * 1. Produces the next state + patches via `produceWithPatches`
   * 2. Updates the in-memory cache immediately (optimistic)
   * 3. Notifies all subscribers (instant UI update)
   * 4. Persists to IndexedDB (durable)
   * 5. Appends an OutboxEntry with patches (for sync)
   *
   * **Rollback behavior**: If the IndexedDB write (step 4 or 5) fails
   * (e.g., quota exceeded, disk full), the in-memory state is rolled
   * back to the previous value and subscribers are re-notified with
   * the reverted state. The error is then re-thrown so callers can
   * handle it (e.g., show a toast notification).
   *
   * @throws If called before the store is hydrated (no current state).
   * @throws If IndexedDB persistence fails (after automatic rollback).
   */
  set(updater: DraftUpdater<T>): Promise<void>;

  /**
   * Subscribe to state changes.
   * The listener fires immediately with current state (if available),
   * then on every subsequent change.
   *
   * @returns An unsubscribe function.
   */
  subscribe(listener: SyncListener<T>): Unsubscribe;

  /**
   * Read all pending outbox entries.
   * Used by framework wrappers to drain the queue via a `pusher`.
   */
  getOutbox(): Promise<readonly OutboxEntry<T>[]>;

  /**
   * Remove synced entries from the outbox by their IDs.
   * Called after a successful `pusher` invocation.
   */
  clearOutbox(ids: readonly string[]): Promise<void>;

  /**
   * Hydrate the store from IndexedDB.
   * Called once during initialization. If `initialState` was provided
   * and no persisted state exists, it writes `initialState` to IDB.
   *
   * @returns The hydrated state, or `undefined` if nothing exists.
   */
  hydrate(): Promise<T | undefined>;

  /**
   * Whether the store is currently loading from IndexedDB.
   *
   * `true` after creation, `false` after `hydrate()` completes or
   * after `destroy()` is called. Framework wrappers use this to
   * show loading skeletons during the initial IDB read.
   *
   * Equivalent to `!isHydrated && !isDestroyed`.
   */
  readonly isHydrating: boolean;

  /**
   * Close the underlying IndexedDB connection.
   * Call this when the store is no longer needed (e.g., component unmount).
   */
  destroy(): void;
}
