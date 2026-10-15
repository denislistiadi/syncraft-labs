/**
 * @module @syncraft-labs/react/use-sync
 *
 * The `useSync` hook - the primary entry point for Syncraft Labs in React.
 */

import { useCallback, useEffect, useSyncExternalStore, useRef } from "react";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";
import { useStoreRegistry } from "./provider.js";
import {
  getOrCreateController,
  destroyStore,
  _resetRegistry,
  ReactStoreController,
  type ControllerSnapshot,
} from "./controller.js";
import { useNetworkStatus } from "./use-network.js";
import { useSyncSuspense } from "./use-sync-suspense.js";

/**
 * React hook for local-first state synchronization.
 *
 * Provides:
 * - Instant reads from in-memory cache (via `useSyncExternalStore`)
 * - Deduplicated hydration and initial fetch per store key
 * - Optimistic updates with proxy drafts (`update`)
 * - Background sync loop with in-flight mutex and exponential backoff
 * - Online/offline network tracking
 * - `refetch()` for imperative pull-to-refresh
 *
 * @template T - The shape of the state. Must be an object.
 * @param key - Unique key for the IndexedDB database.
 * @param options - Configuration: initialState, fetcher, pusher, syncInterval.
 * @returns The hook state and actions.
 *
 * @example
 * ```tsx
 * const { data, update, isHydrating, isOffline, refetch } = useSync<TodoState>("todos", {
 *   initialState: { todos: [] },
 *   fetcher: () => fetch("/api/todos").then((r) => r.json()),
 *   pusher: (entries) => fetch("/api/sync", { method: "POST", body: JSON.stringify(entries) }),
 * });
 * ```
 */
export function useSync<T extends Record<string, unknown>, R = T | undefined>(
  key: string,
  options: UseSyncOptions<T, R>,
): UseSyncReturn<T, R> {
  const registry = useStoreRegistry();
  const controller = getOrCreateController<T>(registry, key, options);
  const store = controller.store;

  // Keep controller options updated on re-renders
  controller.updateOptions(options);

  // State binding via useSyncExternalStore with Selector
  const subscribeStore = useCallback(
    (onStoreChange: () => void) => store.subscribe(() => onStoreChange()),
    [store],
  );

  const selectorRef = useRef(options.selector);
  useEffect(() => {
    selectorRef.current = options.selector;
  }, [options.selector]);

  const lastSnapshotRef = useRef<T | undefined>(undefined);
  const lastSelectionRef = useRef<R | undefined>(undefined);
  const isFirstRender = useRef(true);

  const getSnapshot = useCallback((): R => {
    const currentSnapshot = store.getSnapshot();
    if (
      !isFirstRender.current &&
      currentSnapshot === lastSnapshotRef.current &&
      lastSelectionRef.current !== undefined
    ) {
      return lastSelectionRef.current;
    }
    const selection = selectorRef.current
      ? selectorRef.current(currentSnapshot)
      : (currentSnapshot as unknown as R);

    lastSnapshotRef.current = currentSnapshot;
    lastSelectionRef.current = selection;
    isFirstRender.current = false;
    return selection;
  }, [store]);

  const data = useSyncExternalStore(subscribeStore, getSnapshot);

  // Lifecycle state binding via useSyncExternalStore
  const lifecycleSnapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );

  // Network offline state tracking
  const isOffline = useNetworkStatus(controller);

  // Consumer registration and hydration
  useEffect(() => {
    const unregister = controller.registerConsumer(options);
    void controller.ensureHydrated(options.fetcher);

    return () => {
      unregister();
    };
  }, [controller]);

  /**
   * Mutate state using a proxy draft function.
   *
   * Fire-and-forget - errors are captured in the `error` state. Does not throw.
   */
  const update = useCallback(
    (updater: (draft: T) => void | T) => {
      controller.update(updater);
    },
    [controller],
  );

  /**
   * Force re-fetch from the remote source via `options.fetcher`.
   */
  const refetch = useCallback(async () => {
    await controller.refetch();
  }, [controller]);

  /**
   * Apply incoming authoritative remote state directly (e.g. from WebSocket or SSE).
   */
  const applyRemoteState = useCallback(
    async (remote: T) => {
      await controller.applyRemoteState(remote);
    },
    [controller],
  );

  const destroyStoreCallback = useCallback(() => {
    destroyStore(registry, key);
  }, [registry, key]);

  return {
    data,
    update,
    refetch,
    applyRemoteState,
    isHydrating: lifecycleSnapshot.isHydrating,
    isSyncing: lifecycleSnapshot.isSyncing,
    isOffline,
    error: lifecycleSnapshot.error,
    destroyStore: destroyStoreCallback,
  };
}

// Re-exports for backward compatibility
export {
  useSyncSuspense,
  destroyStore,
  _resetRegistry,
  ReactStoreController,
  getOrCreateController,
  type ControllerSnapshot,
};
