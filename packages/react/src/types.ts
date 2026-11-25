/**
 * @module @syncraft-labs/react/types
 *
 * Type definitions for the React `useSync` hook.
 */

import type {
  DraftUpdater,
  OutboxAck,
  PushHandler,
  SyncStoreConfig,
} from "@syncraft-labs/core";

// ─────────────────────────────────────────────────────────────
// Hook Options
// ─────────────────────────────────────────────────────────────

/**
 * Options for the `useSync` hook.
 * Extends `SyncStoreConfig` (without `storageKey`) plus fetcher/pusher/syncInterval.
 */
export interface UseSyncOptions<T extends Record<string, unknown>, R = T>
  extends Omit<SyncStoreConfig<T>, "storageKey"> {
  /**
   * Optional selector function to extract a specific slice of state.
   * Helps prevent unnecessary re-renders when other parts of the state change.
   */
  readonly selector?: (state: T | undefined) => R;
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
   * Receives pending outbox entries (patches + inverse patches).
   *
   * Return an acknowledgement per entry so entries the server did not commit
   * stay queued. Returning `void` is still supported for backwards
   * compatibility, but every pushed entry is then treated as applied.
   *
   * @example
   * pusher: async (entries) => {
   *   const response = await fetch('/api/sync/push', {
   *     method: 'POST',
   *     body: JSON.stringify({ entries }),
   *   });
   *   const { results } = await response.json();
   *   return results;
   * }
   */
  readonly pusher?: PushHandler<T> | undefined;

  /**
   * Compaction policy applied to the outbox before pushing.
   *
   * @default "none"
   */
  readonly compaction?: "none" | "merge" | undefined;

  /**
   * Called with the normalized acknowledgements after every push. Use it to
   * surface conflicts and rejections in the UI.
   */
  readonly onPushResult?: ((results: readonly OutboxAck[]) => void) | undefined;

  /**
   * Interval (ms) between background sync attempts.
   * Only used when `pusher` is provided.
   *
   * @default 5000
   */
  readonly syncInterval?: number | undefined;

  /** Callback fired when a background sync attempt starts. */
  readonly onSyncStart?: (() => void) | undefined;
  /** Callback fired when a background sync attempt succeeds. */
  readonly onSyncSuccess?: (() => void) | undefined;
  /** Callback fired when a background sync attempt fails. */
  readonly onSyncError?: ((error: Error) => void) | undefined;
  /** Callback fired when an optimistic update is rolled back. */
  readonly onRollback?: ((error: Error, previousState: T | undefined) => void) | undefined;
}

// ─────────────────────────────────────────────────────────────
// Hook Return Value
// ─────────────────────────────────────────────────────────────

/**
 * Return type of the `useSync` hook.
 *
 * @template T - The shape of the state.
 */
export interface UseSyncReturn<T, R = T> {
  /** Current state, or selected slice, or `undefined` during initial hydration (unless selector provides fallback). */
  data: R;

  /**
   * Mutate state using a proxy draft function.
   * Updates the UI instantly (optimistic), persists to IndexedDB,
   * and queues the change in the outbox for sync.
   *
   * Fire-and-forget - errors are captured in the `error` field.
   */
  update: (updater: DraftUpdater<T>) => void;

  /**
   * Force re-fetch from the remote source via `options.fetcher`.
   * Throws if no fetcher was provided.
   */
  refetch: () => Promise<void>;

  /**
   * Applies incoming authoritative remote state (e.g. from WebSocket or server push),
   * reconciling with local uncommitted changes according to the configured conflict resolution strategy.
   */
  applyRemoteState: (remote: T) => Promise<void>;

  /** `true` while loading state from IndexedDB on first mount. */
  isHydrating: boolean;

  /** `true` while pusher or refetch is actively running. */
  isSyncing: boolean;

  /** `true` when `navigator.onLine` is `false`. */
  isOffline: boolean;

  /** Number of mutations waiting in the outbox. */
  pendingCount: number;

  /** Last error from `set()`, `pusher`, or `refetch`. Cleared on success. */
  error: Error | null;

  /**
   * Delete the backing IndexedDB database and reset the store to its initial
   * state. Use on logout or when switching accounts/tenants.
   */
  purge: () => Promise<void>;

  /**
   * Destroy the singleton store for this key and remove it from the registry.
   * Call when you're sure no other component needs this store.
   */
  destroyStore: () => void;
}

