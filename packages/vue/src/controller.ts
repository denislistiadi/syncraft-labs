/**
 * @module @syncraft-labs/vue/controller
 *
 * Store lifecycle controller and singleton registry for Vue.
 */

import {
  createSyncStore,
  BaseStoreController,
  type SyncStore,
  type SyncStoreConfig,
} from "@syncraft-labs/core";
import type { UseSyncOptions } from "./types.js";
import type { StoreRegistry } from "./plugin.js";

export interface VueControllerState {
  readonly isHydrating: boolean;
  readonly isSyncing: boolean;
  readonly error: Error | null;
}

export class VueStoreController<
  T extends Record<string, unknown>,
> extends BaseStoreController<T> {
  private readonly registry: StoreRegistry;

  constructor(
    registry: StoreRegistry,
    storageKey: string,
    store: SyncStore<T>,
    initialOptions: UseSyncOptions<T, any>,
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

export const vueControllerRegistry = new WeakMap<
  SyncStore<any>,
  VueStoreController<any>
>();

export function getOrCreateController<T extends Record<string, unknown>>(
  registry: StoreRegistry,
  key: string,
  options: UseSyncOptions<T, any>,
): VueStoreController<T> {
  let store = registry.get(key) as SyncStore<T> | undefined;
  if (!store) {
    store = createSyncStore<T>({
      storageKey: key,
      initialState: options.initialState,
      maxOutboxSize: options.maxOutboxSize,
      overflowStrategy: options.overflowStrategy,
      onOverflow: options.onOverflow,
      retainSyncedEntries: options.retainSyncedEntries,
      conflictStrategy: options.conflictStrategy,
      resolver: options.resolver,
      onConflictResolved: options.onConflictResolved,
      onQuotaExceeded: options.onQuotaExceeded,
      storageMode: options.storageMode,
      idField: options.idField,
    } as unknown as SyncStoreConfig<T>);
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
 * Reset the entire registry. For testing only.
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
