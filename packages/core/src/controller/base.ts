import { compactOutbox } from "../compact.js";
import { toSyncraftError, SyncraftError } from "../errors.js";
import type { SyncStore } from "../types/store.js";
import type { DraftUpdater } from "../types/updater.js";
import type { OutboxAck, OutboxEntry, PushHandler } from "../types/outbox.js";
import type { SyncStoreConfig } from "../types/config.js";
import { BASE_RETRY_DELAY, DEFAULT_SYNC_INTERVAL, MAX_RETRY_DELAY } from "./constants.js";
import { resolveConflict } from "./conflict.js";

export type BaseControllerOptions<T extends Record<string, unknown>> = Omit<SyncStoreConfig<T>, "storageKey"> & {
  fetcher?: (() => Promise<T>) | undefined;
  pusher?: PushHandler<T> | undefined;
  /**
   * Outbox compaction policy before pushing.
   *
   * - `"none"` (default): push every entry individually so each mutation can
   *   be acknowledged on its own.
   * - `"merge"`: merge the batch into a single entry. Only safe when the
   *   server processes the merged entry atomically.
   */
  compaction?: "none" | "merge" | undefined;
  /**
   * Called with the normalized acknowledgements after every push. Use it to
   * surface conflicts and rejections in the UI.
   */
  onPushResult?: ((results: readonly OutboxAck[]) => void) | undefined;
  syncInterval?: number | undefined;
  onSyncStart?: (() => void) | undefined;
  onSyncSuccess?: (() => void) | undefined;
  onSyncError?: ((error: Error) => void) | undefined;
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

  /**
   * Snapshot of the last server-confirmed state, used as the three-way merge
   * base. Never contains unacknowledged local mutations.
   */
  lastSyncedBase: T | undefined = undefined;

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
    if (this.store.getSnapshot() !== undefined) {
      this.lastSyncedBase = this.store.getSnapshot();
    }
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
        if (this.lastSyncedBase === undefined && hydrated !== undefined) {
          this.lastSyncedBase = hydrated;
        }
        const effectiveFetcher = fetcher ?? this.latestOptions.fetcher;
        if (hydrated === undefined && effectiveFetcher && !this.initialFetchDone) {
          if (!this.initialFetchPromise) {
            this.initialFetchPromise = (async () => {
              try {
                const freshData = await effectiveFetcher();
                await this.store.setServerState(freshData);
                this.lastSyncedBase = freshData;
              } catch (fetchErr) {
                const syncraftErr = toSyncraftError(fetchErr, "fetch", true);
                this.error = syncraftErr;
                const logger = this.latestOptions.logger ?? console;
                logger.error("[Syncraft Labs] Initial fetch failed:", fetchErr);
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
        const logger = this.latestOptions.logger ?? console;
        logger.error("[Syncraft Labs] Hydration failed:", err);
        throw syncraftErr;
      } finally {
        this.hydrationPromise = null;
      }
    })();
    return this.hydrationPromise;
  }

  /**
   * Normalizes a pusher response into one acknowledgement per original outbox
   * entry. Missing entries are treated as `retry` so a partial server response
   * never silently drops a mutation.
   */
  private normalizeAcks(
    rawAcks: void | readonly OutboxAck[],
    pushedEntries: readonly OutboxEntry<T>[],
    originalIds: readonly string[],
    compaction: "none" | "merge",
  ): OutboxAck[] {
    const logger = this.latestOptions.logger ?? console;

    if (rawAcks == null) {
      logger.warn(
        "[Syncraft Labs] pusher() returned no acknowledgements, so every pushed entry is treated as applied. Return OutboxAck[] to keep entries the server did not commit.",
      );
      return pushedEntries.map((entry) => ({ id: entry.id, status: "applied" }));
    }

    const acksById = new Map<string, OutboxAck>();
    for (const ack of rawAcks) {
      acksById.set(ack.id, ack);
    }

    if (compaction === "merge") {
      const compactedAck = acksById.get(pushedEntries[0]!.id);
      if (!compactedAck) {
        return originalIds.map((id) => ({ id, status: "retry" }));
      }
      return originalIds.map((id) => ({ ...compactedAck, id }));
    }

    return pushedEntries.map(
      (entry) => acksById.get(entry.id) ?? { id: entry.id, status: "retry" },
    );
  }

  async runSyncLoop(): Promise<void> {
    if (this.subscribers === 0) return;
    if (this.syncInFlight) return;
    const pusher = this.latestOptions.pusher;
    if (!pusher) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
      return;
    }
    this.syncInFlight = true;
    try {
      const rawOutbox = await this.store.getOutbox(100);
      if (rawOutbox.length === 0) {
        this.retryCount = 0;
        this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
        return;
      }
      const compaction = this.latestOptions.compaction ?? "none";
      let pushedEntries: readonly OutboxEntry<T>[];
      let originalIds: readonly string[];
      if (compaction === "merge") {
        const compactResult = compactOutbox(rawOutbox);
        if (!compactResult) {
          this.retryCount = 0;
          this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
          return;
        }
        pushedEntries = [compactResult.compacted];
        originalIds = compactResult.originalIds;
      } else {
        pushedEntries = rawOutbox;
        originalIds = rawOutbox.map((entry) => entry.id);
      }
      this.isSyncing = true;
      this.latestOptions.onSyncStart?.();
      this.notify();

      const rawAcks = await pusher(pushedEntries);
      const acks = this.normalizeAcks(rawAcks, pushedEntries, originalIds, compaction);

      const removableIds = acks
        .filter((ack) => ack.status !== "retry")
        .map((ack) => ack.id);
      if (removableIds.length > 0) {
        await this.store.clearOutbox(removableIds);
      }

      if (this.latestOptions.onPushResult) {
        try {
          this.latestOptions.onPushResult(acks);
        } catch (cbErr) {
          const logger = this.latestOptions.logger ?? console;
          logger.warn("[Syncraft Labs] Error in onPushResult callback:", cbErr);
        }
      }

      this.isSyncing = false;

      const unacknowledged = acks.filter((ack) => ack.status === "retry");
      if (unacknowledged.length > 0) {
        this.retryCount++;
        const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, this.retryCount), MAX_RETRY_DELAY);
        const logger = this.latestOptions.logger ?? console;
        logger.warn(
          `[Syncraft Labs] ${unacknowledged.length} outbox ${unacknowledged.length === 1 ? "entry was" : "entries were"} not acknowledged. Retrying in ${delay}ms.`,
        );
        this.scheduleNextSync(delay);
        this.notify();
        return;
      }

      this.retryCount = 0;
      // Only advance the merge base once every local mutation has been
      // confirmed, otherwise pending edits would be treated as synced.
      const remainingOutbox = await this.store.getOutbox();
      if (remainingOutbox.length === 0) {
        this.lastSyncedBase = this.store.getSnapshot();
      }
      this.latestOptions.onSyncSuccess?.();
      if (this.error instanceof SyncraftError && this.error.source === "sync") this.error = null;
      else if (this.error && !(this.error instanceof SyncraftError)) this.error = null;
      this.notify();
      this.scheduleNextSync(this.latestOptions.syncInterval ?? DEFAULT_SYNC_INTERVAL);
    } catch (syncErr) {
      this.retryCount++;
      const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, this.retryCount), MAX_RETRY_DELAY);
      const logger = this.latestOptions.logger ?? console;
      logger.warn(`[Syncraft Labs] Sync failed (attempt ${this.retryCount}), retrying in ${delay}ms`, syncErr);
      const err = toSyncraftError(syncErr, "sync", true);
      this.error = err;
      this.isSyncing = false;
      this.latestOptions.onSyncError?.(syncErr instanceof Error ? syncErr : new Error(String(syncErr)));
      this.notify();
      
      if (!err.retryable) {
        const logger = this.latestOptions.logger ?? console;
        logger.error(`[Syncraft Labs] Sync failed with non-retryable error. Halting sync queue until manually triggered.`);
        this.syncInFlight = false;
        return;
      }
      
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
      const logger = this.latestOptions.logger ?? console;
      logger.warn("[Syncraft Labs] Cannot update while hydrating. Wait for hydration to complete.");
      return;
    }
    this.store.set(updater).catch((err: unknown) => {
      this.error = toSyncraftError(err, "store", false);
      this.notify();
    });
  }

  /**
   * Applies authoritative remote state received from a server push, WebSocket,
   * polling mechanism, or external event, automatically reconciling local modifications
   * according to the configured conflict resolution strategy.
   *
   * @param remote - The remote state to reconcile and apply.
   */
  async applyRemoteState(remote: T): Promise<void> {
    const local = this.store.getSnapshot();
    if (local === undefined) {
      // Local state is not yet initialized; adopt remote directly
      await this.store.setServerState(remote);
      this.lastSyncedBase = remote;
      return;
    }

    const base = this.lastSyncedBase ?? local;
    const outbox = await this.store.getOutbox();
    const allPatches = outbox.flatMap((entry) => entry.patches);

    const strategy = this.latestOptions.conflictStrategy ?? "lastWriteWins";

    let resolved: T;
    try {
      resolved = resolveConflict(local, remote, base, allPatches, {
        strategy,
        resolver: this.latestOptions.resolver,
      });
    } catch (err) {
      const typedErr = toSyncraftError(err, "sync", false);
      this.error = typedErr;
      this.notify();
      throw typedErr;
    }

    await this.store.setServerState(resolved);
    // The merge base must remain server-authoritative. `resolved` may contain
    // local edits that the server has not confirmed yet.
    this.lastSyncedBase = remote;

    if (this.latestOptions.onConflictResolved) {
      try {
        this.latestOptions.onConflictResolved({
          strategy,
          storageKey: this.storageKey,
        });
      } catch (cbErr) {
        const logger = this.latestOptions.logger ?? console;
        logger.warn("[Syncraft Labs] Error in onConflictResolved callback:", cbErr);
      }
    }
  }

  async refetch(fetcherOverride?: () => Promise<T>): Promise<void> {
    const fetcher = fetcherOverride ?? this.latestOptions.fetcher;
    if (!fetcher) {
      const err = new SyncraftError("[Syncraft Labs] refetch() called but no fetcher provided.", { source: "fetch", retryable: false });
      const logger = this.latestOptions.logger ?? console;
      logger.warn(err.message);
      this.error = err;
      this.notify();
      throw err;
    }
    this.isSyncing = true;
    this.notify();
    try {
      const freshData = await fetcher();
      await this.store.setServerState(freshData);
      this.lastSyncedBase = freshData;
      if (this.error instanceof SyncraftError && this.error.source === "fetch") this.error = null;
    } catch (fetchErr) {
      const typedError = toSyncraftError(fetchErr, "fetch", true);
      this.error = typedError;
      const logger = this.latestOptions.logger ?? console;
      logger.error("[Syncraft Labs] Refetch failed:", typedError);
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

