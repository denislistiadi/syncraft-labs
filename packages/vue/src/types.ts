/**
 * @module @syncraft-labs/vue/types
 *
 * Type definitions for the Vue `useSync` composable.
 */

import type { Ref, ShallowRef } from "vue";
import type {
  DraftUpdater,
  OutboxAck,
  PushHandler,
  SyncStoreConfig,
} from "@syncraft-labs/core";

// ─────────────────────────────────────────────────────────────
// Composable Options
// ─────────────────────────────────────────────────────────────

/**
 * Options for the `useSync` composable.
 * Extends `SyncStoreConfig` (without `storageKey`) plus fetcher/pusher/syncInterval.
 */
export interface UseSyncOptions<T extends Record<string, unknown>, R = T>
  extends Omit<SyncStoreConfig<T>, "storageKey"> {
  /**
   * Optional selector function to extract a specific slice of state.
   * Helps prevent unnecessary reactivity triggers when other parts of the state change.
   */
  readonly selector?: (state: T | undefined) => R;
  /**
   * Async function to fetch latest state from a remote source.
   * Called once after hydration if IndexedDB is empty,
   * and by `refetch()` for pull-to-refresh.
   */
  readonly fetcher?: (() => Promise<T>) | undefined;

  /**
   * Async function to push pending mutations to a remote source.
   * Called automatically by the background sync loop.
   *
   * Return an acknowledgement per entry so entries the server did not commit
   * stay queued. Returning `void` is still supported for backwards
   * compatibility, but every pushed entry is then treated as applied.
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
// Composable Return Value
// ─────────────────────────────────────────────────────────────

/**
 * Return type of the `useSync` composable.
 * All reactive values are wrapped in Vue refs.
 *
 * @template T - The shape of the state.
 */
export interface UseSyncReturn<T, R = T> {
  /** Reactive state, or selected slice, or `undefined` during initial hydration. */
  data: ShallowRef<R>;

  /** Mutate state using a draft updater function. Fire-and-forget. */
  update: (updater: DraftUpdater<T>) => void;

  /** Force re-fetch from the remote source. */
  refetch: () => Promise<void>;

  /**
   * Applies incoming authoritative remote state (e.g. from WebSocket or server push),
   * reconciling with local uncommitted changes according to the configured conflict resolution strategy.
   */
  applyRemoteState: (remote: T) => Promise<void>;

  /** `true` while loading state from IndexedDB on first mount. */
  isHydrating: Ref<boolean>;

  /** `true` while pusher or refetch is actively running. */
  isSyncing: Ref<boolean>;

  /** `true` when `navigator.onLine` is `false`. */
  isOffline: Ref<boolean>;

  /** Number of mutations waiting in the outbox. */
  pendingCount: Ref<number>;

  /** Last error from set/pusher/refetch. Cleared on success. */
  error: ShallowRef<Error | null>;

  /**
   * Delete the backing IndexedDB database and reset the store to its initial
   * state. Use on logout or when switching accounts/tenants.
   */
  purge: () => Promise<void>;

  /** Destroy the singleton store for this key. */
  destroyStore: () => void;
}

