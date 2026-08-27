/**
 * @module @syncraft-labs/vue/types
 *
 * Type definitions for the Vue `useSync` composable.
 */

import type { Ref, ShallowRef } from "vue";
import type {
  OutboxEntry,
  DraftUpdater,
  OutboxOverflowStrategy,
  OutboxOverflowInfo,
} from "@syncraft-labs/core";

// ─────────────────────────────────────────────────────────────
// Composable Options
// ─────────────────────────────────────────────────────────────

/**
 * Options for the `useSync` composable.
 *
 * @template T - The shape of the state being synchronized.
 */
export interface UseSyncOptions<T extends Record<string, unknown>> {
  /** Initial state when IndexedDB is empty. */
  readonly initialState?: T | undefined;

  /**
   * Async function to fetch latest state from a remote source.
   * Called once after hydration if IndexedDB is empty,
   * and by `refetch()` for pull-to-refresh.
   */
  readonly fetcher?: (() => Promise<T>) | undefined;

  /**
   * Async function to push pending mutations to a remote source.
   * Called automatically by the background sync loop.
   */
  readonly pusher?: ((entries: readonly OutboxEntry<T>[]) => Promise<void>) | undefined;

  /**
   * Interval (ms) between background sync attempts.
   * @default 5000
   */
  readonly syncInterval?: number | undefined;

  /** Maximum number of outbox entries before overflow strategy triggers. */
  readonly maxOutboxSize?: number | undefined;

  /** Strategy for handling outbox overflow when maxOutboxSize is reached. */
  readonly overflowStrategy?: OutboxOverflowStrategy | undefined;

  /** Callback invoked when an outbox overflow event occurs. */
  readonly onOverflow?: ((info: OutboxOverflowInfo) => void | Promise<void>) | undefined;

  /** Controls how state is persisted to IndexedDB ("document" | "collection"). */
  readonly storageMode?: "document" | "collection" | undefined;

  /** Property name on each entity used as unique ID when storageMode is "collection". */
  readonly idField?: string | undefined;
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
export interface UseSyncReturn<T> {
  /** Reactive state, or `undefined` during initial hydration. */
  data: ShallowRef<T | undefined>;

  /** Mutate state using an Immer draft function. Fire-and-forget. */
  update: (updater: DraftUpdater<T>) => void;

  /** Force re-fetch from the remote source. */
  refetch: () => Promise<void>;

  /** `true` while loading state from IndexedDB on first mount. */
  isHydrating: Ref<boolean>;

  /** `true` while pusher or refetch is actively running. */
  isSyncing: Ref<boolean>;

  /** `true` when `navigator.onLine` is `false`. */
  isOffline: Ref<boolean>;

  /** Last error from set/pusher/refetch. Cleared on success. */
  error: ShallowRef<Error | null>;

  /** Destroy the singleton store for this key. */
  destroyStore: () => void;
}
