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
import {
  createSyncStore,
  compactOutbox,
  toSyncraftError,
  SyncraftError,
  type SyncStore,
  type DraftUpdater,
} from "@syncraft-labs/core";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";
import { useStoreRegistry, type StoreRegistry } from "./provider.js";

// ─────────────────────────────────────────────────────────────
// Sync Constants
// ─────────────────────────────────────────────────────────────

/** Base delay for exponential backoff (ms). */
const BASE_RETRY_DELAY = 1000;

/** Maximum delay between retries (ms). */
const MAX_RETRY_DELAY = 60_000;

/** Default sync interval (ms). */
const DEFAULT_SYNC_INTERVAL = 5000;

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
export class ReactStoreController<T extends Record<string, unknown>> {
  readonly store: SyncStore<T>;
  readonly storageKey: string;
  private readonly registry: StoreRegistry;

  private subscribers = 0;
  private isHydrated = false;
  isHydrating = true;
  isSyncing = false;
  error: Error | null = null;

  hydrationError: Error | null = null;
  hydrationPromise: Promise<T | undefined> | null = null;
  initialFetchPromise: Promise<void> | null = null;
  private initialFetchDone = false;

  private syncInFlight = false;
  private syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;

  latestOptions: UseSyncOptions<T>;
  private readonly listeners = new Set<() => void>();
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
    this.registry = registry;
    this.storageKey = storageKey;
    this.store = store;
    this.latestOptions = initialOptions;
  }

  getSnapshot = (): ControllerSnapshot => {
    return this.currentSnapshot;
  };

  private notify(): void {
    this.currentSnapshot = {
      isHydrating: this.isHydrating,
      isSyncing: this.isSyncing,
      error: this.error,
    };
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  registerConsumer(options: UseSyncOptions<T>): () => void {
    this.subscribers++;
    this.updateOptions(options);

    // If this is the first consumer, start sync loop if pusher exists
    if (this.subscribers === 1 && this.latestOptions.pusher) {
      this.scheduleNextSync(
        this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL,
      );
    }

    return () => {
      this.subscribers = Math.max(0, this.subscribers - 1);
      if (this.subscribers === 0) {
        if (this.syncTimeoutId !== null) {
          clearTimeout(this.syncTimeoutId);
          this.syncTimeoutId = null;
        }
      }
    };
  }

  updateOptions(options: UseSyncOptions<T>): void {
    this.latestOptions = options;
  }

  async ensureHydrated(fetcher?: () => Promise<T>): Promise<T | undefined> {
    if (this.isHydrated && this.initialFetchDone) {
      return this.store.getSnapshot();
    }

    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = (async () => {
      try {
        this.isHydrating = true;
        this.hydrationError = null;
        this.notify();

        const hydrated = await this.store.hydrate();
        this.isHydrated = true;
        this.isHydrating = false;

        // If no data after hydration and a fetcher is provided, do initial fetch once
        const effectiveFetcher = fetcher ?? this.latestOptions.fetcher;
        if (hydrated === undefined && effectiveFetcher && !this.initialFetchDone) {
          if (!this.initialFetchPromise) {
            this.initialFetchPromise = (async () => {
              try {
                const freshData = await effectiveFetcher();
                await this.store.set(() => freshData);
              } catch (fetchErr) {
                const syncraftErr = toSyncraftError(fetchErr, "fetch", true);
                this.error = syncraftErr;
                console.error("[Syncraft Labs] Initial fetch failed:", fetchErr);
              } finally {
                this.initialFetchDone = true;
                this.initialFetchPromise = null;
                this.notify();
              }
            })();
          }
          await this.initialFetchPromise;
        } else {
          this.initialFetchDone = true;
        }

        this.notify();
        return this.store.getSnapshot();
      } catch (err) {
        const syncraftErr = toSyncraftError(err, "hydration", false);
        this.hydrationError = syncraftErr;
        this.error = syncraftErr;
        this.isHydrating = false;
        this.notify();
        console.error("[Syncraft Labs] Hydration failed:", err);
        throw syncraftErr;
      } finally {
        this.hydrationPromise = null;
      }
    })();

    return this.hydrationPromise;
  }

  async runSyncLoop(): Promise<void> {
    if (this.subscribers === 0) return;
    if (this.syncInFlight) return;

    const pusher = this.latestOptions.pusher;
    if (!pusher) return;

    // Don't attempt sync while offline
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.scheduleNextSync(
        this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL,
      );
      return;
    }

    this.syncInFlight = true;

    try {
      // 1. Read outbox once
      const rawOutbox = await this.store.getOutbox();

      if (rawOutbox.length === 0) {
        this.retryCount = 0;
        this.scheduleNextSync(
          this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL,
        );
        return;
      }

      // 2. Compact the exact same snapshot without a second IDB read
      const compactResult = compactOutbox(rawOutbox);
      if (!compactResult) {
        this.retryCount = 0;
        this.scheduleNextSync(
          this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL,
        );
        return;
      }

      this.isSyncing = true;
      this.notify();

      await pusher([compactResult.compacted]);
      // 3. Clear only the IDs from the pushed snapshot
      await this.store.clearOutbox(compactResult.originalIds);

      // Success — reset backoff and sync error
      this.retryCount = 0;
      this.isSyncing = false;

      if (this.error instanceof SyncraftError && this.error.source === "sync") {
        this.error = null;
      } else if (this.error && !(this.error instanceof SyncraftError)) {
        this.error = null;
      }

      this.notify();
      this.scheduleNextSync(
        this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL,
      );
    } catch (syncErr) {
      this.retryCount++;
      const delay = Math.min(
        BASE_RETRY_DELAY * Math.pow(2, this.retryCount),
        MAX_RETRY_DELAY,
      );

      console.warn(
        `[Syncraft Labs] Sync failed (attempt ${this.retryCount}), retrying in ${delay}ms`,
        syncErr,
      );

      this.error = toSyncraftError(syncErr, "sync", true);
      this.isSyncing = false;
      this.notify();

      this.scheduleNextSync(delay);
    } finally {
      this.syncInFlight = false;
    }
  }

  scheduleNextSync(delay: number): void {
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = null;
    }
    if (this.subscribers > 0 && this.latestOptions.pusher) {
      this.syncTimeoutId = setTimeout(() => {
        void this.runSyncLoop();
      }, delay);
    }
  }

  triggerSync(): void {
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = null;
    }
    this.retryCount = 0;
    void this.runSyncLoop();
  }

  update(updater: DraftUpdater<T>): void {
    if (this.isHydrating) {
      console.warn(
        "[Syncraft Labs] Cannot update while hydrating. Wait for hydration to complete.",
      );
      return;
    }

    this.store.set(updater).catch((err: unknown) => {
      this.error = toSyncraftError(err, "store", false);
      this.notify();
    });
  }

  async refetch(fetcherOverride?: () => Promise<T>): Promise<void> {
    const fetcher = fetcherOverride ?? this.latestOptions.fetcher;

    if (!fetcher) {
      const err = new SyncraftError(
        "[Syncraft Labs] refetch() called but no fetcher provided.",
        { source: "fetch", retryable: false },
      );
      console.warn(err.message);
      this.error = err;
      this.notify();
      throw err;
    }

    this.isSyncing = true;
    this.notify();

    try {
      const freshData = await fetcher();
      await this.store.set(() => freshData);

      if (this.error instanceof SyncraftError && this.error.source === "fetch") {
        this.error = null;
      }
    } catch (fetchErr) {
      const typedError = toSyncraftError(fetchErr, "fetch", true);
      this.error = typedError;
      console.error("[Syncraft Labs] Refetch failed:", typedError);
      throw typedError;
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  destroy(): void {
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = null;
    }
    this.listeners.clear();
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
