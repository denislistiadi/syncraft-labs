import type { SyncListener } from "../types/index.js";
import type { SyncStoreConfig } from "../types/config.js";
import type { IDBPDatabase } from "idb";

export interface StoreContext<T extends Record<string, unknown>> {
  storageKey: string;
  config: SyncStoreConfig<T>;
  initialState: T | undefined;
  storageMode: "document" | "collection";
  idField?: string;
  maxOutboxSize: number;
  overflowStrategy: "reject" | "dropOldest" | "forceFlush";
  onOverflow: SyncStoreConfig<T>["onOverflow"];
  memoryState: T | undefined;
  listeners: Set<SyncListener<T>>;
  db: IDBPDatabase<unknown> | null;
  isHydrated: boolean;
  isDestroyed: boolean;
  hasWarnedPreHydration: boolean;
  hydrationPromise: Promise<T | undefined> | null;
  channel: BroadcastChannel | null;
  getMonotonicTimestamp: () => number;
}

export function createStoreContext<T extends Record<string, unknown>>(
  config: SyncStoreConfig<T>,
  getMonotonicTimestamp: () => number,
): StoreContext<T> {
  return {
    storageKey: config.storageKey,
    config,
    initialState: config.initialState,
    storageMode: (config.storageMode ?? "document") as "document" | "collection",
    idField: (config as any).idField,
    maxOutboxSize: config.maxOutboxSize ?? 1000,
    overflowStrategy: (config.overflowStrategy ?? "reject") as any,
    onOverflow: config.onOverflow,
    memoryState: undefined,
    listeners: new Set(),
    db: null,
    isHydrated: false,
    isDestroyed: false,
    hasWarnedPreHydration: false,
    hydrationPromise: null,
    channel: null,
    getMonotonicTimestamp,
  };
}
