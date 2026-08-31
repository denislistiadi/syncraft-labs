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
import { createSyncStore, BaseStoreController, type SyncStore, type DraftUpdater } from "@syncraft-labs/core";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";
import { SyncraftRegistryKey, type StoreRegistry } from "./plugin.js";

// ─────────────────────────────────────────────────────────────
// Store Lifecycle Controller
// ─────────────────────────────────────────────────────────────

export interface VueControllerState {
  readonly isHydrating: boolean;
  readonly isSyncing: boolean;
  readonly error: Error | null;
}

export class VueStoreController<T extends Record<string, unknown>> extends BaseStoreController<T> {
  private readonly registry: StoreRegistry;

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
    this.notifyListeners();
  }

  override destroy(): void {
    super.destroy();
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
