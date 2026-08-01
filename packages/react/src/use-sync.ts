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
 *   │         useSyncExternalStore                            │
 *   │         (subscribe + getSnapshot)                       │
 *   │                  │                                      │
 *   │    ┌─────────────┼──────────────┐                       │
 *   │    ▼             ▼              ▼                       │
 *   │  Hydration   Sync Loop   Network Tracker                │
 *   │  (useEffect) (useEffect)  (useEffect)                   │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Key design decisions:
 * - Store singleton per key (module-level Map registry)
 * - useSyncExternalStore for tearing-safe subscriptions
 * - Background sync with exponential backoff
 * - Stores outlive components (never auto-destroyed)
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createSyncStore, type SyncStore } from "@syncraft-labs/core";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";
import { useStoreRegistry, type StoreRegistry } from "./provider.js";

/**
 * Get an existing store from the registry, or create a new one.
 *
 * @template T - The state shape.
 * @param registry - The store registry from Context.
 * @param key - The storage key for IndexedDB.
 * @param options - Hook options (only `initialState` is used for store creation).
 * @returns The singleton store for this key.
 */
function getOrCreateStore<T extends Record<string, unknown>>(
  registry: StoreRegistry,
  key: string,
  options: UseSyncOptions<T>,
): SyncStore<T> {
  const existing = registry.get(key);
  if (existing) {
    return existing as unknown as SyncStore<T>;
  }

  const store = createSyncStore<T>({
    storageKey: key,
    initialState: options.initialState,
  });

  registry.set(key, store as unknown as SyncStore<never>);
  return store;
}

/**
 * Destroy a store and remove it from the registry.
 * Closes the IndexedDB connection and clears all listeners.
 *
 * @param registry - The store registry from Context.
 * @param key - The storage key of the store to destroy.
 */
export function destroyStore(registry: StoreRegistry, key: string): void {
  const store = registry.get(key);
  if (store) {
    store.destroy();
    registry.delete(key);
  }
}

/**
 * Reset the entire registry. **For testing only.**
 * Destroys all stores and clears the Map.
 */
export function _resetRegistry(registry: StoreRegistry): void {
  for (const store of registry.values()) {
    store.destroy();
  }
  registry.clear();
}

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
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * React hook for local-first state synchronization.
 *
 * Provides:
 * - Instant reads from in-memory cache (via `useSyncExternalStore`)
 * - Automatic hydration from IndexedDB on mount
 * - Optimistic updates with Immer drafts
 * - Background sync loop with exponential backoff
 * - Network online/offline tracking
 * - `refetch()` for pull-to-refresh
 *
 * @template T - The shape of the state. Must be an object (Immer requirement).
 * @param key - Unique key for the IndexedDB database.
 * @param options - Configuration: initialState, fetcher, pusher, syncInterval.
 * @returns The hook state and actions.
 *
 * @example
 * ```tsx
 * const { data, update, isHydrating, isOffline } = useSync<TodoState>("todos", {
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

  // ── 1. Get or create singleton store ──────────────────────

  // Use a ref to ensure the store is created once and never changes
  // even if the component re-renders with different options.
  const storeRef = useRef<SyncStore<T> | null>(null);
  if (storeRef.current === null) {
    storeRef.current = getOrCreateStore(registry, key, options);
  }
  const store = storeRef.current;

  // Capture options in a ref to avoid stale closures in effects.
  // This lets us change fetcher/pusher without restarting effects.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // ── 2. State binding via useSyncExternalStore ─────────────

  // Wrapper needed because SyncListener<T> is (state: T) => void
  // but useSyncExternalStore expects (onStoreChange: () => void) => Unsubscribe
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(() => onStoreChange()),
    [store],
  );

  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);

  const data = useSyncExternalStore(subscribe, getSnapshot);

  // ── 3. Local UI state ─────────────────────────────────────

  const [isHydrating, setIsHydrating] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [error, setError] = useState<Error | null>(null);

  // ── 4. Auto-hydration on mount ────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const hydrated = await store.hydrate();
        if (cancelled) return;
        setIsHydrating(false);

        // If no data after hydration and a fetcher is provided,
        // do the initial fetch to populate the store.
        if (hydrated === undefined && optionsRef.current.fetcher) {
          try {
            const freshData = await optionsRef.current.fetcher();
            if (cancelled) return;
            // Replace entire state via Immer draft replacement
            await store.set(() => freshData);
          } catch (fetchErr) {
            if (cancelled) return;
            setError(fetchErr as Error);
            console.error("[Syncraft Labs] Initial fetch failed:", fetchErr);
          }
        }
      } catch (hydrateErr) {
        if (cancelled) return;
        setError(hydrateErr as Error);
        setIsHydrating(false);
        console.error("[Syncraft Labs] Hydration failed:", hydrateErr);
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [store]);

  // ── 5. Network status tracking ────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ── 6. Background sync loop with exponential backoff ──────

  // Ref to allow the online handler to trigger an immediate sync
  const triggerSyncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!optionsRef.current.pusher) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let retryCount = 0;
    const syncInterval = optionsRef.current.syncInterval ?? DEFAULT_SYNC_INTERVAL;

    const syncLoop = async () => {
      if (cancelled) return;

      // Don't attempt sync while offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        timeoutId = setTimeout(syncLoop, syncInterval);
        return;
      }

      const pusher = optionsRef.current.pusher;
      if (!pusher) return;

      try {
        const outbox = await store.getOutbox();

        if (outbox.length === 0) {
          // Nothing to sync — reset backoff and schedule next check
          retryCount = 0;
          if (!cancelled) timeoutId = setTimeout(syncLoop, syncInterval);
          return;
        }

        setIsSyncing(true);
        await pusher(outbox);
        await store.clearOutbox(outbox.map((e) => e.id));

        // Success — reset state
        retryCount = 0;
        setError(null);
        setIsSyncing(false);

        if (!cancelled) timeoutId = setTimeout(syncLoop, syncInterval);
      } catch (syncErr) {
        retryCount++;
        const delay = Math.min(
          BASE_RETRY_DELAY * Math.pow(2, retryCount),
          MAX_RETRY_DELAY,
        );

        console.warn(
          `[Syncraft Labs] Sync failed (attempt ${retryCount}), retrying in ${delay}ms`,
          syncErr,
        );

        setError(syncErr as Error);
        setIsSyncing(false);

        if (!cancelled) timeoutId = setTimeout(syncLoop, delay);
      }
    };

    // Expose trigger for online handler
    triggerSyncRef.current = () => {
      clearTimeout(timeoutId);
      retryCount = 0; // Reset backoff on reconnect
      void syncLoop();
    };

    // Start first sync after the interval (let hydration finish)
    timeoutId = setTimeout(syncLoop, syncInterval);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      triggerSyncRef.current = null;
    };
  }, [store]);

  // ── 7. Trigger immediate sync on reconnect ────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      triggerSyncRef.current?.();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // ── 8. update() — optimistic mutation ─────────────────────

  const update = useCallback(
    (updater: (draft: T) => void | T) => {
      if (store.isHydrating) {
        console.warn(
          "[Syncraft Labs] Cannot update while hydrating. Wait for hydration to complete.",
        );
        return;
      }

      store.set(updater).catch((err: unknown) => {
        setError(err as Error);
      });
    },
    [store],
  );

  // ── 9. refetch() — pull fresh data from remote ────────────

  const refetch = useCallback(async () => {
    const fetcher = optionsRef.current.fetcher;

    if (!fetcher) {
      console.warn("[Syncraft Labs] refetch() called but no fetcher provided.");
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      const freshData = await fetcher();
      // Replace entire state via Immer draft replacement
      await store.set(() => freshData);
    } catch (fetchErr) {
      const typedError = fetchErr as Error;
      setError(typedError);
      console.error("[Syncraft Labs] Refetch failed:", typedError);
      throw typedError;
    } finally {
      setIsSyncing(false);
    }
  }, [store]);

  // ── 10. destroyStore() — manual cleanup ───────────────────

  const destroyStoreCallback = useCallback(() => {
    destroyStore(registry, key);
  }, [registry, key]);

  // ── Return ────────────────────────────────────────────────

  return {
    data,
    update,
    refetch,
    isHydrating,
    isSyncing,
    isOffline,
    error,
    destroyStore: destroyStoreCallback,
  };
}

export function useSyncSuspense<T extends Record<string, unknown>>(
  key: string,
  options: UseSyncOptions<T>,
): Omit<UseSyncReturn<T>, "data" | "isHydrating"> & { data: T } {
  const registry = useStoreRegistry();
  const storeRef = useRef<SyncStore<T> | null>(null);
  if (storeRef.current === null) {
    storeRef.current = getOrCreateStore(registry, key, options);
  }
  const store = storeRef.current;

  if (store.isHydrating) {
    throw store.hydrate();
  }

  const result = useSync(key, options);

  // If data is undefined and no initialState was provided,
  // we could potentially throw a fetcher promise here for deeper Suspense integration.
  // For now, we cast it to T as per Phase 1 simplicity.
  if (result.data === undefined && options.fetcher) {
    // Future: implement fetcher promise throwing here.
  }

  return {
    ...result,
    data: result.data as T,
  };
}
