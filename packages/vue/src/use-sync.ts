/**
 * @module @syncraft-labs/vue/use-sync
 *
 * The `useSync` composable — the primary entry point for Syncraft Labs in Vue.
 *
 * Same architecture as the React hook, using Vue 3 Composition API:
 * - `shallowRef()` for state (avoids deep reactivity on Immer-managed objects)
 * - `ref()` for boolean flags
 * - `onMounted()` / `onUnmounted()` for lifecycle
 * - Module-level singleton controller registry shared per store key
 * - In-flight sync loop mutex and single-snapshot compaction
 * - Deduplicated hydration and initial fetch
 */

import { shallowRef, ref, onMounted, onUnmounted, inject, type ShallowRef, type Ref } from "vue";
import {
  createSyncStore,
  compactOutbox,
  toSyncraftError,
  SyncraftError,
  type SyncStore,
  type DraftUpdater,
} from "@syncraft-labs/core";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";
import { SyncraftRegistryKey, type StoreRegistry } from "./plugin.js";

// ─────────────────────────────────────────────────────────────
// Sync Constants
// ─────────────────────────────────────────────────────────────

const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 60_000;
const DEFAULT_SYNC_INTERVAL = 5000;

// ─────────────────────────────────────────────────────────────
// Store Lifecycle Controller
// ─────────────────────────────────────────────────────────────

export interface VueControllerState {
  readonly isHydrating: boolean;
  readonly isSyncing: boolean;
  readonly error: Error | null;
}

export class VueStoreController<T extends Record<string, unknown>> {
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

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  registerConsumer(options: UseSyncOptions<T>): () => void {
    this.subscribers++;
    this.updateOptions(options);

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

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.scheduleNextSync(
        this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL,
      );
      return;
    }

    this.syncInFlight = true;

    try {
      const rawOutbox = await this.store.getOutbox();

      if (rawOutbox.length === 0) {
        this.retryCount = 0;
        this.scheduleNextSync(
          this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL,
        );
        return;
      }

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
      await this.store.clearOutbox(compactResult.originalIds);

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
    vueControllerRegistry.delete(this.store);
  }
}

const vueControllerRegistry = new WeakMap<
  SyncStore<any>,
  VueStoreController<any>
>();

export function getOrCreateController<T extends Record<string, unknown>>(
  registry: StoreRegistry,
  key: string,
  options: UseSyncOptions<T>,
): VueStoreController<T> {
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

  let controller = vueControllerRegistry.get(store) as
    | VueStoreController<T>
    | undefined;

  if (!controller) {
    controller = new VueStoreController<T>(registry, key, store, options);
    vueControllerRegistry.set(store, controller as VueStoreController<any>);
  } else {
    controller.updateOptions(options);
  }

  return controller;
}

/**
 * Destroy a store and remove it from the registry.
 */
export function destroyStore(registry: StoreRegistry, key: string): void {
  const store = registry.get(key);
  if (store) {
    const controller = vueControllerRegistry.get(store);
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
 */
export function _resetRegistry(registry: StoreRegistry): void {
  for (const store of Array.from(registry.values())) {
    const controller = vueControllerRegistry.get(store);
    if (controller) {
      controller.destroy();
    } else {
      store.destroy();
    }
  }
  registry.clear();
}

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
 * const { data, update, isHydrating, refetch } = useSync<TodoState>("todos", {
 *   initialState: { todos: [] },
 * });
 * </script>
 * ```
 */
export function useSync<T extends Record<string, unknown>>(
  key: string,
  options: UseSyncOptions<T>,
): UseSyncReturn<T> {
  const registry = inject(SyncraftRegistryKey);
  if (!registry) {
    throw new Error(
      "[Syncraft Labs] useSync must be used within a Vue app that has installed the Syncraft plugin. " +
        "Use app.use(createSyncraft()) in your main entry file.",
    );
  }

  const controller = getOrCreateController<T>(registry, key, options);
  const store = controller.store;

  controller.updateOptions(options);

  // ── Reactive state ─────────────────────────────────────────
  const data: ShallowRef<T | undefined> = shallowRef<T | undefined>(
    store.getSnapshot(),
  );
  const isHydrating: Ref<boolean> = ref(controller.isHydrating);
  const isSyncing: Ref<boolean> = ref(controller.isSyncing);
  const isOffline: Ref<boolean> = ref(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const error: ShallowRef<Error | null> = shallowRef<Error | null>(
    controller.error,
  );

  // ── Subscriptions ──────────────────────────────────────────
  const unsubscribeStore = store.subscribe((state: T) => {
    data.value = state;
  });

  const syncControllerState = () => {
    isHydrating.value = controller.isHydrating;
    isSyncing.value = controller.isSyncing;
    error.value = controller.error;
  };

  const unsubscribeController = controller.subscribe(syncControllerState);

  // ── Network status handlers ────────────────────────────────
  const handleOnline = () => {
    isOffline.value = false;
    controller.triggerSync();
  };

  const handleOffline = () => {
    isOffline.value = true;
  };

  // ── Mount & Unmount ────────────────────────────────────────
  let unregisterConsumer: (() => void) | null = null;

  onMounted(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    unregisterConsumer = controller.registerConsumer(options);
    void controller.ensureHydrated(options.fetcher);
  });

  onUnmounted(() => {
    unsubscribeStore();
    unsubscribeController();

    if (unregisterConsumer) {
      unregisterConsumer();
      unregisterConsumer = null;
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  });

  // ── Actions ────────────────────────────────────────────────
  const update = (updater: DraftUpdater<T>) => {
    controller.update(updater);
  };

  const refetch = async () => {
    await controller.refetch();
  };

  const destroyStoreCallback = () => {
    destroyStore(registry, key);
  };

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
