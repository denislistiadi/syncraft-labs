import type { DraftUpdater, SyncListener, Unsubscribe } from "./updater.js";
import type { OutboxEntry, ArchivedOutboxEntry } from "./outbox.js";

export interface SyncStore<T> {
  get(): Promise<T | undefined>;
  getSnapshot(): T | undefined;
  set(updater: DraftUpdater<T>): Promise<void>;
  setServerState(state: T): Promise<void>;
  subscribe(listener: SyncListener<T>): Unsubscribe;
  getOutbox(limit?: number): Promise<readonly OutboxEntry<T>[]>;
  /** Number of mutations waiting in the outbox. */
  getPendingCount(): Promise<number>;
  /**
   * Subscribe to outbox changes (local writes, acknowledgements, purge, and
   * cross-tab broadcasts).
   */
  subscribeOutbox(listener: () => void): Unsubscribe;
  clearOutbox(ids: readonly string[]): Promise<void>;
  compactOutbox(): Promise<readonly OutboxEntry<T>[]>;
  getArchivedOutbox(limit?: number): Promise<readonly ArchivedOutboxEntry<T>[]>;
  clearArchivedOutbox(options?: { olderThan?: number }): Promise<number>;
  hydrate(): Promise<T | undefined>;
  readonly isHydrating: boolean;
  /**
   * Delete the backing IndexedDB database, clear the in-memory snapshot, and
   * reset hydration so the store can be hydrated again from scratch.
   */
  purge(): Promise<void>;
  destroy(): void;
}

