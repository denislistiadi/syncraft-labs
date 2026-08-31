import type { DraftUpdater, SyncListener, Unsubscribe } from "./updater.js";
import type { OutboxEntry } from "./outbox.js";

export interface SyncStore<T> {
  get(): Promise<T | undefined>;
  getSnapshot(): T | undefined;
  set(updater: DraftUpdater<T>): Promise<void>;
  subscribe(listener: SyncListener<T>): Unsubscribe;
  getOutbox(): Promise<readonly OutboxEntry<T>[]>;
  clearOutbox(ids: readonly string[]): Promise<void>;
  compactOutbox(): Promise<readonly OutboxEntry<T>[]>;
  hydrate(): Promise<T | undefined>;
  readonly isHydrating: boolean;
  destroy(): void;
}
