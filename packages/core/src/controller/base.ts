import { compactOutbox } from "../compact.js";
import { toSyncraftError, SyncraftError } from "../errors.js";
import type { SyncStore } from "../types/store.js";
import type { DraftUpdater } from "../types/updater.js";
import type { OutboxEntry } from "../types/outbox.js";
import type { SyncStoreConfig } from "../types/config.js";
import { BASE_RETRY_DELAY, DEFAULT_SYNC_INTERVAL, MAX_RETRY_DELAY } from "./constants.js";

export type BaseControllerOptions<T extends Record<string, unknown>> = Omit<SyncStoreConfig<T>, "storageKey"> & {
  fetcher?: (() => Promise<T>) | undefined;
  pusher?: ((entries: readonly OutboxEntry<T>[]) => Promise<void>) | undefined;
  syncInterval?: number | undefined;
};

export interface ControllerSnapshot {
  readonly isHydrating: boolean;
  readonly isSyncing: boolean;
  readonly error: Error | null;
}

export abstract class BaseStoreController<T extends Record<string, unknown>> {
  readonly store: SyncStore<T>;
  readonly storageKey: string;

  private subscribers = 0;
  private isHydrated = false;
  isHydrating = true;
  isSyncing = false;
  error: Error | null = null;

  hydrationError: Error | null = null;
  hydrationPromise: Promise<T | undefined> | null = null;
  initialFetchPromise: Promise<void> | null = null;
  private initialFetchDone = false;

  private syncInFlight = false;
  private syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;

  latestOptions: BaseControllerOptions<T>;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected notifyListeners(): void {
    this.listeners.forEach((l) => l());
  }

  protected abstract notify(): void;

  constructor(storageKey: string, store: SyncStore<T>, initialOptions: BaseControllerOptions<T>) {
    this.storageKey = storageKey;
    this.store = store;
    this.latestOptions = initialOptions;
  }

  registerConsumer(options: BaseControllerOptions<T>): () => void {
    this.subscribers++;
    this.updateOptions(options);
    if (this.subscribers === 1 && this.latestOptions.pusher) {
      this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
    }
    return () => {
      this.subscribers = Math.max(0, this.subscribers - 1);
      if (this.subscribers === 0 && this.syncTimeoutId !== null) {
        clearTimeout(this.syncTimeoutId);
        this.syncTimeoutId = null;
      }
    };
  }

  updateOptions(options: BaseControllerOptions<T>): void {
    this.latestOptions = options;
  }

  async ensureHydrated(fetcher?: () => Promise<T>): Promise<T | undefined> {
    if (this.isHydrated && this.initialFetchDone) return this.store.getSnapshot();
    if (this.hydrationPromise) return this.hydrationPromise;
    this.hydrationPromise = (async () => {
      try {
        this.isHydrating = true;
        this.hydrationError = null;
        this.notify();
        const hydrated = await this.store.hydrate();
        this.isHydrated = true;
        this.isHydrating = false;
        const effectiveFetcher = fetcher ?? this.latestOptions.fetcher;
        if (hydrated === undefined && effectiveFetcher && !this.initialFetchDone) {
          if (!this.initialFetchPromise) {
            this.initialFetchPromise = (async () => {
              try {
                const freshData = await effectiveFetcher();
                await this.store.set(() => freshData);
              } catch (fetchErr) {
                const syncraftErr = toSyncraftError(fetchErr, "fetch", true);
                this.error = syncraftErr;
                console.error("[Syncraft Labs] Initial fetch failed:", fetchErr);
              } finally {
                this.initialFetchDone = true;
                this.initialFetchPromise = null;
                this.notify();
              }
            })();
          }
          await this.initialFetchPromise;
        } else {
          this.initialFetchDone = true;
        }
        this.notify();
        return this.store.getSnapshot();
      } catch (err) {
        const syncraftErr = toSyncraftError(err, "hydration", false);
        this.hydrationError = syncraftErr;
        this.error = syncraftErr;
        this.isHydrating = false;
        this.notify();
        console.error("[Syncraft Labs] Hydration failed:", err);
        throw syncraftErr;
      } finally {
        this.hydrationPromise = null;
      }
    })();
    return this.hydrationPromise;
  }

  async runSyncLoop(): Promise<void> {
    if (this.subscribers === 0) return;
    if (this.syncInFlight) return;
    const pusher = this.latestOptions.pusher;
    if (!pusher) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
      return;
    }
    this.syncInFlight = true;
    try {
      const rawOutbox = await this.store.getOutbox();
      if (rawOutbox.length === 0) {
        this.retryCount = 0;
        this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
        return;
      }
      const compactResult = compactOutbox(rawOutbox);
      if (!compactResult) {
        this.retryCount = 0;
        this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
        return;
      }
      this.isSyncing = true;
      this.notify();
      await pusher([compactResult.compacted]);
      await this.store.clearOutbox(compactResult.originalIds);
      this.retryCount = 0;
      this.isSyncing = false;
      if (this.error instanceof SyncraftError && this.error.source === "sync") this.error = null;
      else if (this.error && !(this.error instanceof SyncraftError)) this.error = null;
      this.notify();
      this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
    } catch (syncErr) {
      this.retryCount++;
      const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, this.retryCount), MAX_RETRY_DELAY);
      console.warn(`[Syncraft Labs] Sync failed (attempt ${this.retryCount}), retrying in ${delay}ms`, syncErr);
      this.error = toSyncraftError(syncErr, "sync", true);
      this.isSyncing = false;
      this.notify();
      this.scheduleNextSync(delay);
    } finally {
      this.syncInFlight = false;
    }
  }

  scheduleNextSync(delay: number): void {
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = null;
    }
    if (this.subscribers > 0 && this.latestOptions.pusher) {
      this.syncTimeoutId = setTimeout(() => {
        void this.runSyncLoop();
      }, delay);
    }
  }

  triggerSync(): void {
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = null;
    }
    this.retryCount = 0;
    void this.runSyncLoop();
  }

  update(updater: DraftUpdater<T>): void {
    if (this.isHydrating) {
      console.warn("[Syncraft Labs] Cannot update while hydrating. Wait for hydration to complete.");
      return;
    }
    this.store.set(updater).catch((err: unknown) => {
      this.error = toSyncraftError(err, "store", false);
      this.notify();
    });
  }

  async refetch(fetcherOverride?: () => Promise<T>): Promise<void> {
    const fetcher = fetcherOverride ?? this.latestOptions.fetcher;
    if (!fetcher) {
      const err = new SyncraftError("[Syncraft Labs] refetch() called but no fetcher provided.", { source: "fetch", retryable: false });
      console.warn(err.message);
      this.error = err;
      this.notify();
      throw err;
    }
    this.isSyncing = true;
    this.notify();
    try {
      const freshData = await fetcher();
      await this.store.set(() => freshData);
      if (this.error instanceof SyncraftError && this.error.source === "fetch") this.error = null;
    } catch (fetchErr) {
      const typedError = toSyncraftError(fetchErr, "fetch", true);
      this.error = typedError;
      console.error("[Syncraft Labs] Refetch failed:", typedError);
      throw typedError;
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  destroy(): void {
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = null;
    }
    this.listeners.clear();
  }
}
