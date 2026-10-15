/**
 * @module @syncraft-labs/vue/use-sync
 *
 * The `useSync` composable - the primary entry point for Syncraft Labs in Vue.
 *
 * Same architecture as the React hook, using Vue 3 Composition API:
 * - `shallowRef()` for state (avoids deep reactivity on draft-managed objects)
 * - `ref()` for boolean flags
 * - `onMounted()` / `onScopeDispose()` for lifecycle
 * - Module-level singleton controller registry shared per store key
 * - In-flight sync loop mutex and single-snapshot compaction
 * - Deduplicated hydration and initial fetch
 */

import {
  shallowRef,
  ref,
  onMounted,
  onScopeDispose,
  inject,
  type ShallowRef,
  type Ref,
} from "vue";
import type { DraftUpdater } from "@syncraft-labs/core";
import type { UseSyncOptions, UseSyncReturn } from "./types.js";
import { SyncraftRegistryKey } from "./plugin.js";
import {
  getOrCreateController,
  destroyStore,
} from "./controller.js";
import { useNetworkStatus } from "./use-network.js";

export {
  VueStoreController,
  vueControllerRegistry,
  getOrCreateController,
  destroyStore,
  _resetRegistry,
  type VueControllerState,
} from "./controller.js";

export {
  useNetworkStatus,
  type UseNetworkStatusReturn,
} from "./use-network.js";

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
export function useSync<T extends Record<string, unknown>, R = T | undefined>(
  key: string,
  options: UseSyncOptions<T, R>,
): UseSyncReturn<T, R> {
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
  const getSelectedState = (state: T | undefined): R => {
    return options.selector ? options.selector(state) : (state as unknown as R);
  };

  const data: ShallowRef<R> = shallowRef<R>(
    getSelectedState(store.getSnapshot()),
  );
  const isHydrating: Ref<boolean> = ref(controller.isHydrating);
  const isSyncing: Ref<boolean> = ref(controller.isSyncing);
  const error: ShallowRef<Error | null> = shallowRef<Error | null>(
    controller.error,
  );

  // ── Network status tracking ────────────────────────────────
  const { isOffline } = useNetworkStatus(controller);

  // ── Subscriptions ──────────────────────────────────────────
  const unsubscribeStore = store.subscribe((state: T) => {
    const newValue = getSelectedState(state);
    if (data.value !== newValue) {
      data.value = newValue;
    }
  });

  const syncControllerState = () => {
    isHydrating.value = controller.isHydrating;
    isSyncing.value = controller.isSyncing;
    error.value = controller.error;
  };

  const unsubscribeController = controller.subscribe(syncControllerState);

  // ── Mount & Unmount Lifecycle ──────────────────────────────
  let unregisterConsumer: (() => void) | null = null;

  onMounted(() => {
    unregisterConsumer = controller.registerConsumer(options);
    void controller.ensureHydrated(options.fetcher);
  });

  onScopeDispose(() => {
    unsubscribeStore();
    unsubscribeController();

    if (unregisterConsumer) {
      unregisterConsumer();
      unregisterConsumer = null;
    }
  });

  // ── Actions ────────────────────────────────────────────────
  const update = (updater: DraftUpdater<T>) => {
    controller.update(updater);
  };

  const refetch = async () => {
    await controller.refetch();
  };

  const applyRemoteState = async (remote: T) => {
    await controller.applyRemoteState(remote);
  };

  const destroyStoreCallback = () => {
    destroyStore(registry, key);
  };

  return {
    data,
    update,
    refetch,
    applyRemoteState,
    isHydrating,
    isSyncing,
    isOffline,
    error,
    destroyStore: destroyStoreCallback,
  };
}
