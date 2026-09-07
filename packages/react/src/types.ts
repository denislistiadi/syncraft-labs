/**
 * @module @syncraft-labs/react/types
 *
 * Type definitions for the React `useSync` hook.
 */

import type { OutboxEntry, DraftUpdater, SyncStoreConfig } from "@syncraft-labs/core";

// ─────────────────────────────────────────────────────────────
// Hook Options
// ─────────────────────────────────────────────────────────────

/**
 * Options for the `useSync` hook.
 * Extends `SyncStoreConfig` (without `storageKey`) plus fetcher/pusher/syncInterval.
 */
export interface UseSyncOptions<T extends Record<string, unknown>>
  extends Omit<SyncStoreConfig<T>, "storageKey"> {
  /**
   * Async function to fetch the latest state from a remote source.
   * Called once after hydration if IndexedDB is empty.
   * Also called by `refetch()` to pull fresh data.
   *
   * @example
   * fetcher: () => fetch('/api/todos').then(r => r.json())
   */
  readonly fetcher?: (() => Promise<T>) | undefined;

  /**
   * Async function to push pending mutations to a remote source.
   * Called automatically by the background sync loop.
   * Receives all pending outbox entries (patches + inverse patches).
   *
   * @example
   * pusher: (entries) => fetch('/api/sync', {
   *   method: 'POST',
   *   body: JSON.stringify(entries),
   * })
   */
  readonly pusher?: ((entries: readonly OutboxEntry<T>[]) => Promise<void>) | undefined;

  /**
   * Interval (ms) between background sync attempts.
   * Only used when `pusher` is provided.
   *
   * @default 5000
   */
  readonly syncInterval?: number | undefined;
}

// ─────────────────────────────────────────────────────────────
// Hook Return Value
// ─────────────────────────────────────────────────────────────

/**
 * Return type of the `useSync` hook.
 *
 * @template T - The shape of the state.
 */
export interface UseSyncReturn<T> {
  /** Current state, or `undefined` during initial hydration. */
  data: T | undefined;

  /**
   * Mutate state using an Immer draft function.
   * Updates the UI instantly (optimistic), persists to IndexedDB,
   * and queues the change in the outbox for sync.
   *
   * Fire-and-forget — errors are captured in the `error` field.
   */
  update: (updater: DraftUpdater<T>) => void;

  /**
   * Force re-fetch from the remote source via `options.fetcher`.
   * Throws if no fetcher was provided.
   */
  refetch: () => Promise<void>;

  /** `true` while loading state from IndexedDB on first mount. */
  isHydrating: boolean;

  /** `true` while pusher or refetch is actively running. */
  isSyncing: boolean;

  /** `true` when `navigator.onLine` is `false`. */
  isOffline: boolean;

  /** Last error from `set()`, `pusher`, or `refetch`. Cleared on success. */
  error: Error | null;

  /**
   * Destroy the singleton store for this key and remove it from the registry.
   * Call when you're sure no other component needs this store.
   */
  destroyStore: () => void;
}
