/**
 * @module @syncraft-labs/react/use-sync-suspense
 *
 * React Suspense integration hook for Syncraft Labs.
 */

import { SyncraftError } from "@syncraft-labs/core";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";
import { useStoreRegistry } from "./provider.js";
import { getOrCreateController } from "./controller.js";
import { useSync } from "./use-sync.js";

/**
 * React hook for local-first state synchronization with React Suspense.
 *
 * Automatically suspends while loading state from IndexedDB or during initial fetch.
 * Guarantees that `data` is defined and non-optional upon render.
 *
 * **Requirement**: This hook must be used within a React `<Suspense>` boundary and
 * wrapped with an `<ErrorBoundary>` to catch hydration or network fetch errors.
 *
 * @template T - The shape of the state. Must be an object.
 * @param key - Unique storage key for the store.
 * @param options - Hook configuration options.
 * @returns Hook state and actions with non-optional `data`.
 *
 * @throws {Promise<T | undefined>} Suspends during hydration.
 * @throws {SyncraftError} Throws synchronously if hydration or initial fetch failed.
 * @throws {Error} Throws if no data exists and no fetcher is provided.
 */
export function useSyncSuspense<T extends Record<string, unknown>, R = T>(
  key: string,
  options: UseSyncOptions<T, R>,
): Omit<UseSyncReturn<T, R>, "data" | "isHydrating"> & { data: R } {
  const registry = useStoreRegistry();
  const controller = getOrCreateController<T>(registry, key, options);

  // If hydration previously failed, throw synchronously so ErrorBoundary catches it
  // and we do NOT repeatedly throw a new rejecting promise into an infinite Suspense loop.
  if (controller.hydrationError) {
    throw controller.hydrationError;
  }

  if (controller.isHydrating) {
    throw controller.ensureHydrated(options.fetcher);
  }

  // If initial fetch is currently in flight, suspend on it
  if (controller.initialFetchPromise) {
    throw controller.initialFetchPromise;
  }

  const result = useSync(key, options);

  if (result.data === undefined) {
    if (result.error) {
      throw result.error;
    }
    throw new SyncraftError(
      `[Syncraft Labs] useSyncSuspense: Store "${key}" has no data after hydration. ` +
        `Provide an initialState or fetcher in options, or use useSync() to handle undefined state.`,
      { source: "store", retryable: false },
    );
  }

  return {
    ...result,
    data: result.data as R,
  };
}
