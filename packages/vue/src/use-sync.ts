/**
 * @module @syncraft-labs/vue/use-sync
 *
 * The `useSync` composable — the primary entry point for Syncraft Labs in Vue.
 *
 * Same architecture as the React hook, but using Vue 3 Composition API:
 * - `shallowRef()` for state (avoids deep reactivity on Immer-managed objects)
 * - `ref()` for boolean flags
 * - `onMounted()` / `onUnmounted()` for lifecycle
 * - Module-level singleton registry (shared with React pattern)
 */

import { shallowRef, ref, onMounted, onUnmounted, type ShallowRef } from "vue";
import { createSyncStore, type SyncStore } from "@syncraft-labs/core";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";

// ─────────────────────────────────────────────────────────────
// Singleton Store Registry
// ─────────────────────────────────────────────────────────────

/**
 * Module-level registry — same pattern as React.
 * Two components calling `useSync("todos")` share the same store.
 */
const storeRegistry = new Map<string, SyncStore<never>>();

function getOrCreateStore<T extends object>(
  key: string,
  options: UseSyncOptions<T>,
): SyncStore<T> {
  const existing = storeRegistry.get(key);
  if (existing) {
    return existing as unknown as SyncStore<T>;
  }

  const store = createSyncStore<T>({
    storageKey: key,
    initialState: options.initialState,
  });

  storeRegistry.set(key, store as unknown as SyncStore<never>);
  return store;
}

/**
 * Destroy a store and remove it from the registry.
 */
export function destroyStore(key: string): void {
  const store = storeRegistry.get(key);
  if (store) {
    store.destroy();
    storeRegistry.delete(key);
  }
}

/**
 * Reset the entire registry. **For testing only.**
 */
export function _resetRegistry(): void {
  for (const store of storeRegistry.values()) {
    store.destroy();
  }
  storeRegistry.clear();
}

// ─────────────────────────────────────────────────────────────
// Sync Constants
// ─────────────────────────────────────────────────────────────

const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 60_000;
const DEFAULT_SYNC_INTERVAL = 5000;

// ─────────────────────────────────────────────────────────────
// Composable
// ─────────────────────────────────────────────────────────────

/**
 * Vue 3 composable for local-first state synchronization.
 *
 * @template T - The shape of the state.
 * @param key - Unique key for the IndexedDB database.
 * @param options - Configuration: initialState, fetcher, pusher, syncInterval.
 * @returns Reactive refs and actions.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSync } from "@syncraft-labs/vue";
 *
 * const { data, update, isHydrating } = useSync<TodoState>("todos", {
 *   initialState: { todos: [] },
 * });
 * </script>
 * ```
 */
export function useSync<T extends object>(
  key: string,
  options: UseSyncOptions<T>,
): UseSyncReturn<T> {
  // ── 1. Get or create singleton store ──────────────────────

  const store = getOrCreateStore(key, options);

  // ── 2. Reactive state ─────────────────────────────────────

  // shallowRef for complex objects — Immer manages immutability,
  // we don't need Vue's deep reactivity tracking.
  const data: ShallowRef<T | undefined> = shallowRef<T | undefined>(store.getSnapshot());
  const isHydrating = ref(true);
  const isSyncing = ref(false);
  const isOffline = ref(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const error = shallowRef<Error | null>(null);

  // ── 3. Subscribe to store changes ─────────────────────────

  // Subscribe immediately during setup() so we catch any state
  // changes that happen during the mount phase.
  const unsubscribe = store.subscribe((state: T) => {
    data.value = state;
  });

  // ── 4. Lifecycle management ───────────────────────────────

  let cancelled = false;
  let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  const syncInterval = options.syncInterval ?? DEFAULT_SYNC_INTERVAL;

  // ── Sync loop ─────────────────────────────────────────────

  const syncLoop = async () => {
    if (cancelled || !options.pusher) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      syncTimeoutId = setTimeout(syncLoop, syncInterval);
      return;
    }

    const pusher = options.pusher;

    try {
      const outbox = await store.getOutbox();

      if (outbox.length === 0) {
        retryCount = 0;
        if (!cancelled) syncTimeoutId = setTimeout(syncLoop, syncInterval);
        return;
      }

      isSyncing.value = true;
      await pusher(outbox);
      await store.clearOutbox(outbox.map((e) => e.id));

      retryCount = 0;
      error.value = null;
      isSyncing.value = false;

      if (!cancelled) syncTimeoutId = setTimeout(syncLoop, syncInterval);
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

      error.value = syncErr as Error;
      isSyncing.value = false;

      if (!cancelled) syncTimeoutId = setTimeout(syncLoop, delay);
    }
  };

  // ── Online/Offline handlers ───────────────────────────────

  const handleOnline = () => {
    isOffline.value = false;
    // Trigger immediate sync on reconnect
    if (options.pusher && syncTimeoutId !== null) {
      clearTimeout(syncTimeoutId);
      retryCount = 0;
      void syncLoop();
    }
  };

  const handleOffline = () => {
    isOffline.value = true;
  };

  // ── Mount ─────────────────────────────────────────────────

  onMounted(async () => {
    // Start network tracking
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    // Hydrate from IndexedDB
    try {
      const hydrated = await store.hydrate();
      if (cancelled) return;
      isHydrating.value = false;
      data.value = store.getSnapshot();

      // Fetch if empty and fetcher provided
      if (hydrated === undefined && options.fetcher) {
        try {
          const freshData = await options.fetcher();
          if (cancelled) return;
          await store.set(() => freshData);
        } catch (fetchErr) {
          if (cancelled) return;
          error.value = fetchErr as Error;
          console.error("[Syncraft Labs] Initial fetch failed:", fetchErr);
        }
      }
    } catch (hydrateErr) {
      if (cancelled) return;
      error.value = hydrateErr as Error;
      isHydrating.value = false;
      console.error("[Syncraft Labs] Hydration failed:", hydrateErr);
    }

    // Start background sync loop
    if (options.pusher) {
      syncTimeoutId = setTimeout(syncLoop, syncInterval);
    }
  });

  // ── Unmount ───────────────────────────────────────────────

  onUnmounted(() => {
    cancelled = true;
    unsubscribe();

    if (syncTimeoutId !== null) {
      clearTimeout(syncTimeoutId);
      syncTimeoutId = null;
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  });

  // ── Actions ───────────────────────────────────────────────

  const update = (updater: (draft: T) => void | T) => {
    if (store.isHydrating) {
      console.warn(
        "[Syncraft Labs] Cannot update while hydrating. Wait for hydration to complete.",
      );
      return;
    }

    store.set(updater).catch((err: unknown) => {
      error.value = err as Error;
    });
  };

  const refetch = async () => {
    if (!options.fetcher) {
      console.warn("[Syncraft Labs] refetch() called but no fetcher provided.");
      return;
    }

    isSyncing.value = true;
    error.value = null;

    try {
      const freshData = await options.fetcher();
      await store.set(() => freshData);
    } catch (fetchErr) {
      const typedError = fetchErr as Error;
      error.value = typedError;
      console.error("[Syncraft Labs] Refetch failed:", typedError);
      throw typedError;
    } finally {
      isSyncing.value = false;
    }
  };

  const destroyStoreCallback = () => {
    destroyStore(key);
  };

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
