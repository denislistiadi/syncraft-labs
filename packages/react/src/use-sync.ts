/**
 * @module @syncraft-labs/react/use-sync
 *
 * The `useSync` hook — the primary entry point for Syncraft Labs in React.
 *
 * Architecture:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  Component A           Component B                      │
 *   │  useSync("todos")      useSync("todos")                │
 *   │       │                      │                          │
 *   │       └──────────┬───────────┘                          │
 *   │                  ▼                                      │
 *   │         Store Registry (Map)                            │
 *   │          key: "todos" → SyncStore                       │
 *   │                  │                                      │
 *   │                  ▼                                      │
 *   │         StoreController (Lifecycle)                     │
 *   │    ┌─────────────┼──────────────┐                       │
 *   │    ▼             ▼              ▼                       │
 *   │  Hydration   Sync Loop   Network Tracker                │
 *   │  (Single)    (Single)    (Single)                       │
 *   │                  │                                      │
 *   │                  ▼                                      │
 *   │         useSyncExternalStore                            │
 *   │         (subscribe + getSnapshot)                       │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Key design decisions:
 * - Store singleton per key (module-level Map registry)
 * - Single hydration, initial fetch, and background sync loop per store instance
 * - In-flight sync mutex + single-snapshot compaction for race-condition safety
 * - Reactive options supporting dynamic syncInterval and callbacks
 * - useSyncExternalStore for tearing-safe state and lifecycle subscriptions
 * - Stores outlive components (never auto-destroyed unless destroyStore is called)
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createSyncStore, BaseStoreController, SyncraftError, type SyncStore } from "@syncraft-labs/core";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";
import { useStoreRegistry, type StoreRegistry } from "./provider.js";

// ─────────────────────────────────────────────────────────────
// Store Lifecycle Controller
// ─────────────────────────────────────────────────────────────

export interface ControllerSnapshot {
  readonly isHydrating: boolean;
  readonly isSyncing: boolean;
  readonly error: Error | null;
}

/**
 * Manages singleton lifecycle (hydration, initial fetch, and sync loop)
 * for a specific store key across all mounted component subscribers.
 */
export class ReactStoreController<T extends Record<string, unknown>> extends BaseStoreController<T> {
  private readonly registry: StoreRegistry;
  private currentSnapshot: ControllerSnapshot = {
    isHydrating: true,
    isSyncing: false,
    error: null,
  };

  constructor(
    registry: StoreRegistry,
    storageKey: string,
    store: SyncStore<T>,
    initialOptions: UseSyncOptions<T>,
  ) {
    super(storageKey, store, initialOptions);
    this.registry = registry;
  }

  protected override notify(): void {
    this.currentSnapshot = {
      isHydrating: this.isHydrating,
      isSyncing: this.isSyncing,
      error: this.error,
    };
    this.notifyListeners();
  }

  getSnapshot = (): ControllerSnapshot => {
    return this.currentSnapshot;
  };

  override destroy(): void {
    super.destroy();
    this.store.destroy();
    this.registry.delete(this.storageKey);
    controllerRegistry.delete(this.store);
  }
}

const controllerRegistry = new WeakMap<
  SyncStore<any>,
  ReactStoreController<any>
>();

export function getOrCreateController<T extends Record<string, unknown>>(
  registry: StoreRegistry,
  key: string,
  options: UseSyncOptions<T>,
): ReactStoreController<T> {
  let store = registry.get(key) as SyncStore<T> | undefined;
  if (!store) {
    store = createSyncStore<T>({
      storageKey: key,
      initialState: options.initialState,
      maxOutboxSize: options.maxOutboxSize,
      overflowStrategy: options.overflowStrategy,
      onOverflow: options.onOverflow,
      storageMode: options.storageMode,
      idField: options.idField,
    } as unknown as import("@syncraft-labs/core").SyncStoreConfig<T>);
    registry.set(key, store as unknown as SyncStore<never>);
  }

  let controller = controllerRegistry.get(store) as
    | ReactStoreController<T>
    | undefined;

  if (!controller) {
    controller = new ReactStoreController<T>(registry, key, store, options);
    controllerRegistry.set(store, controller as ReactStoreController<any>);
  } else {
    controller.updateOptions(options);
  }

  return controller;
}

/**
 * Destroy a store and its controller, removing it from the registry.
 * Closes the IndexedDB connection and clears all listeners.
 */
export function destroyStore(registry: StoreRegistry, key: string): void {
  const store = registry.get(key);
  if (store) {
    const controller = controllerRegistry.get(store);
    if (controller) {
      controller.destroy();
    } else {
      store.destroy();
      registry.delete(key);
    }
  }
}

/**
 * Reset the entire registry. **For testing only.**
 * Destroys all stores and clears the Map.
 */
export function _resetRegistry(registry: StoreRegistry): void {
  for (const store of Array.from(registry.values())) {
    const controller = controllerRegistry.get(store);
    if (controller) {
      controller.destroy();
    } else {
      store.destroy();
    }
  }
  registry.clear();
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * React hook for local-first state synchronization.
 *
 * Provides:
 * - Instant reads from in-memory cache (via `useSyncExternalStore`)
 * - Deduplicated hydration and initial fetch per store key
 * - Optimistic updates with Immer drafts (`update`)
 * - Background sync loop with in-flight mutex and exponential backoff
 * - Online/offline network tracking
 * - `refetch()` for imperative pull-to-refresh
 *
 * @template T - The shape of the state. Must be an object (Immer requirement).
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
export function useSync<T extends Record<string, unknown>>(
  key: string,
  options: UseSyncOptions<T>,
): UseSyncReturn<T> {
  const registry = useStoreRegistry();
  const controller = getOrCreateController<T>(registry, key, options);
  const store = controller.store;

  // Keep controller options updated on re-renders
  controller.updateOptions(options);

  // ── State binding via useSyncExternalStore ─────────────
  const subscribeStore = useCallback(
    (onStoreChange: () => void) => store.subscribe(() => onStoreChange()),
    [store],
  );
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  const data = useSyncExternalStore(subscribeStore, getSnapshot);

  // ── Lifecycle state binding via useSyncExternalStore ───
  const lifecycleSnapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );

  // ── Network offline state tracking ─────────────────────
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOffline(false);
      controller.triggerSync();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [controller]);

  // ── Consumer registration & hydration ──────────────────
  useEffect(() => {
    const unregister = controller.registerConsumer(options);
    void controller.ensureHydrated(options.fetcher);

    return () => {
      unregister();
    };
  }, [controller]);

  // ── Actions ────────────────────────────────────────────

  /**
   * Mutate state using an Immer draft function.
   *
   * Fire-and-forget — errors are captured in the `error` state. Does not throw.
   */
  const update = useCallback(
    (updater: (draft: T) => void | T) => {
      controller.update(updater);
    },
    [controller],
  );

  /**
   * Force re-fetch from the remote source via `options.fetcher`.
   *
   * Sets `error` state on failure AND re-throws the error so callers can
   * handle it imperatively with try/catch.
   *
   * @throws {SyncraftError} If no fetcher is configured or the fetcher rejects.
   */
  const refetch = useCallback(async () => {
    await controller.refetch();
  }, [controller]);

  const destroyStoreCallback = useCallback(() => {
    destroyStore(registry, key);
  }, [registry, key]);

  return {
    data,
    update,
    refetch,
    isHydrating: lifecycleSnapshot.isHydrating,
    isSyncing: lifecycleSnapshot.isSyncing,
    isOffline,
    error: lifecycleSnapshot.error,
    destroyStore: destroyStoreCallback,
  };
}

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
export function useSyncSuspense<T extends Record<string, unknown>>(
  key: string,
  options: UseSyncOptions<T>,
): Omit<UseSyncReturn<T>, "data" | "isHydrating"> & { data: T } {
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
    data: result.data as T,
  };
}
