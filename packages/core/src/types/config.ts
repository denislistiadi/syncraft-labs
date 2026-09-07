export interface BaseSyncStoreConfig<T> {
  readonly storageKey: string;
  readonly initialState?: T | undefined;
  readonly maxOutboxSize?: number | undefined;
  readonly overflowStrategy?: OutboxOverflowStrategy | undefined;
  readonly onOverflow?: ((info: OutboxOverflowInfo) => void | Promise<void>) | undefined;
}

export type OutboxOverflowStrategy = "reject" | "dropOldest" | "forceFlush";

export interface OutboxOverflowInfo {
  readonly storageKey: string;
  readonly outboxSize: number;
  readonly maxOutboxSize: number;
  readonly strategy: OutboxOverflowStrategy;
}

export interface DocumentSyncStoreConfig<T> extends BaseSyncStoreConfig<T> {
  readonly storageMode?: "document" | undefined;
  readonly idField?: never | undefined;
}

export interface CollectionSyncStoreConfig<T> extends BaseSyncStoreConfig<T> {
  readonly storageMode: "collection";
  readonly idField: string;
}

export type SyncStoreConfig<T> = DocumentSyncStoreConfig<T> | CollectionSyncStoreConfig<T>;
