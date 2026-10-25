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
  QuotaExceededInfo,
  QuotaExceededHandler,
} from "./types/config.js";
export type { OutboxEntry, ArchivedOutboxEntry } from "./types/outbox.js";
export type { SyncListener, Unsubscribe, DraftUpdater } from "./types/updater.js";
export type { SyncStore } from "./types/store.js";
export type { EncryptedPayload, EncryptionKeyInput } from "./types/crypto.js";


