import type { Patch } from "../produce/types.js";

/**
 * Strategy used to resolve conflicts between local state and incoming remote state.
 *
 * - `"lastWriteWins"`: The latest state unconditionally overwrites older state.
 * - `"custom"`: Delegates resolution to a user-provided `ConflictResolver` function.
 */
export type ConflictStrategy = "lastWriteWins" | "custom";

/**
 * Contextual information provided to a custom conflict resolver function.
 *
 * @template T - The state shape.
 */
export interface ConflictInfo<T> {
  /** The current local state. */
  readonly local: T;
  /** The incoming remote state received from server/peer. */
  readonly remote: T;
  /** The last known common base state successfully synchronized. */
  readonly base: T;
  /** Uncommitted / pending local patches that have not yet been synced. */
  readonly patches: readonly Patch[];
}

/**
 * Custom three-way conflict resolver function.
 *
 * @template T - The state shape.
 * @param info - Conflict context containing local, remote, base states and uncommitted patches.
 * @returns The resolved state to apply to the store.
 */
export type ConflictResolver<T> = (info: ConflictInfo<T>) => T;

/**
 * Details emitted when a conflict is resolved.
 */
export interface ConflictResolvedInfo {
  readonly strategy: ConflictStrategy;
  readonly storageKey: string;
}

import type { QuotaExceededHandler, QuotaExceededInfo } from "../storage/withQuotaGuard.js";

export type { QuotaExceededHandler, QuotaExceededInfo };

export interface BaseSyncStoreConfig<T> {
  readonly storageKey: string;
  readonly initialState?: T | undefined;
  readonly maxOutboxSize?: number | undefined;
  readonly overflowStrategy?: OutboxOverflowStrategy | undefined;
  readonly onOverflow?: ((info: OutboxOverflowInfo) => void | Promise<void>) | undefined;
  /**
   * Conflict resolution strategy when reconciling incoming remote state.
   * @default "lastWriteWins"
   */
  readonly conflictStrategy?: ConflictStrategy | undefined;
  /**
   * Custom conflict resolver function required when `conflictStrategy` is set to `"custom"`.
   */
  readonly resolver?: ConflictResolver<T> | undefined;
  /**
   * Optional callback invoked whenever a state conflict is resolved.
   */
  readonly onConflictResolved?: ((info: ConflictResolvedInfo) => void) | undefined;
  /**
   * Optional callback invoked whenever IndexedDB storage quota is exceeded.
   */
  readonly onQuotaExceeded?: QuotaExceededHandler | undefined;
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

