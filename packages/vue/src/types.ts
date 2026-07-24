/**
 * @module @syncraft-labs/vue/types
 *
 * Type definitions for the Vue `useSync` composable.
 */

import type { Ref, ShallowRef } from "vue";
import type { OutboxEntry, DraftUpdater } from "@syncraft-labs/core";

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
  readonly initialState?: T;

  /**
   * Async function to fetch latest state from a remote source.
   * Called once after hydration if IndexedDB is empty,
   * and by `refetch()` for pull-to-refresh.
   */
  readonly fetcher?: () => Promise<T>;

  /**
   * Async function to push pending mutations to a remote source.
   * Called automatically by the background sync loop.
   */
  readonly pusher?: (entries: readonly OutboxEntry<T>[]) => Promise<void>;

  /**
   * Interval (ms) between background sync attempts.
   * @default 5000
   */
  readonly syncInterval?: number;
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
