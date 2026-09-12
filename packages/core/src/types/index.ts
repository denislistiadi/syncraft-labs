export type {
  BaseSyncStoreConfig,
  DocumentSyncStoreConfig,
  CollectionSyncStoreConfig,
  SyncStoreConfig,
  OutboxOverflowStrategy,
  OutboxOverflowInfo,
  ConflictStrategy,
  ConflictInfo,
  ConflictResolver,
  ConflictResolvedInfo,
} from "./config.js";
export type { OutboxEntry } from "./outbox.js";
export type { SyncListener, Unsubscribe, DraftUpdater } from "./updater.js";
export type { SyncStore } from "./store.js";

