/**
 * @module @syncraft-labs/react/controller
 *
 * Store lifecycle controller for React integration.
 */

import { createSyncStore, BaseStoreController, type SyncStore } from "@syncraft-labs/core";
import type { UseSyncOptions } from "./types.js";
import type { StoreRegistry } from "./provider.js";

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
    initialOptions: UseSyncOptions<T, any>,
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

export const controllerRegistry = new WeakMap<
  SyncStore<any>,
  ReactStoreController<any>
>();

export function getOrCreateController<T extends Record<string, unknown>>(
  registry: StoreRegistry,
  key: string,
  options: UseSyncOptions<T, any>,
): ReactStoreController<T> {
  let store = registry.get(key) as SyncStore<T> | undefined;
  if (!store) {
    store = createSyncStore<T>({
      storageKey: key,
      initialState: options.initialState,
      maxOutboxSize: options.maxOutboxSize,
      overflowStrategy: options.overflowStrategy,
      onOverflow: options.onOverflow,
      encryptionKey: options.encryptionKey,
      retainSyncedEntries: options.retainSyncedEntries,
      conflictStrategy: options.conflictStrategy,
      resolver: options.resolver,
      onConflictResolved: options.onConflictResolved,
      onQuotaExceeded: options.onQuotaExceeded,
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
 * Reset the entire registry. For testing only.
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
