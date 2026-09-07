// @ts-nocheck
import { produceWithPatches, type Patch } from "../produce/index.js";
import { compactOutbox as compactOutboxFn } from "../compact.js";
import { isDevMode, deepFreeze, assertNoCycles, validateStateShape } from "../guards/index.js";
import type { DraftUpdater, OutboxEntry, SyncListener, SyncStore, SyncStoreConfig, Unsubscribe } from "../types/index.js";
import { closeDB, openSyncDB, pushOutbox, readOutbox, readState, writeState, readCollectionState, writeCollectionState, clearOutbox as clearOutboxStorage } from "../storage.js";
import { createMonotonicClock, generateId } from "../utils/id.js";
import { enforceOutboxLimit } from "./outboxGuard.js";
import { persistState } from "./persistence.js";
import { createStoreContext } from "./context.js";
import { createBroadcaster } from "./broadcast.js";
import type { IDBPDatabase } from "idb";

export function createSyncStore<T extends Record<string, unknown>>(config: SyncStoreConfig<T>): SyncStore<T> {
  const { storageKey } = config;
  if (config.initialState !== undefined && isDevMode()) {
    assertNoCycles(config.initialState, `initialState for store "${storageKey}"`);
    validateStateShape(config.initialState, `initialState for store "${storageKey}"`);
  }
  // @ts-ignore
  let processedInitialState: T | undefined = (config.initialState as unknown) as T | undefined;
  if (processedInitialState !== undefined && isDevMode()) {
    // @ts-ignore
    processedInitialState = deepFreeze(processedInitialState as unknown as T);
  }
  const ctx = createStoreContext(config, createMonotonicClock());
  // @ts-ignore
  ctx.initialState = processedInitialState;

  if (ctx.storageMode === "collection" && !ctx.idField) throw new Error(`[Syncraft Labs] idField is required when storageMode is "collection" for store "${storageKey}".`);

  // Broadcast channel
  ctx.channel = createBroadcaster(storageKey, (s) => { ctx.memoryState = s; }, (s) => notifyListeners(s));

  function notifyListeners(state: T): void {
    ctx.listeners.forEach((listener) => listener(state));
  }
  function assertNotDestroyed(): void {
    if (ctx.isDestroyed) throw new Error(`[Syncraft Labs] Store "${storageKey}" has been destroyed. Create a new store instance if you need to continue using this key.`);
  }
  function assertDB(): IDBPDatabase<unknown> {
    if (ctx.db === null) throw new Error(`[Syncraft Labs] Store "${storageKey}" database is not initialized. Call hydrate() before performing operations.`);
    return ctx.db;
  }

  const store: SyncStore<T> = {
    async get(): Promise<T | undefined> {
      assertNotDestroyed();
      if (ctx.memoryState !== undefined) return ctx.memoryState;
      if (ctx.db !== null) {
        const persisted = ctx.storageMode === "collection" ? await readCollectionState<T>(ctx.db) : await readState<T>(ctx.db);
        if (persisted !== undefined) {
          ctx.memoryState = isDevMode() ? deepFreeze(persisted) : persisted;
          return ctx.memoryState;
        }
      }
      return ctx.initialState;
    },
    getSnapshot(): T | undefined {
      if (!ctx.isHydrated && !ctx.isDestroyed && !ctx.hasWarnedPreHydration && isDevMode()) {
        ctx.hasWarnedPreHydration = true;
        console.warn(`[Syncraft Labs] getSnapshot() called on store "${storageKey}" before hydrate() completed. This usually means the store hasn't finished loading from IndexedDB yet. Did you forget to await store.hydrate() or use the isHydrating state in your UI?`);
      }
      return ctx.memoryState;
    },
    async set(updater: DraftUpdater<T>): Promise<void> {
      assertNotDestroyed();
      const currentDB = assertDB();
      const baseState = ctx.memoryState ?? ctx.initialState;
      let nextState: T;
      let patches: Patch[];
      let inversePatches: Patch[];
      if (baseState === undefined) {
        try {
          const result = updater(undefined as unknown as T);
          if (result === undefined) throw new Error("No replacement state returned");
          nextState = result;
        } catch {
          throw new Error(`[Syncraft Labs] Cannot call set() on store "${storageKey}" — no state exists. Either provide an initialState in the config, call hydrate() first, or ensure the store has been populated via a fetcher.`);
        }
        patches = [{ op: "replace", path: [], value: nextState }];
        inversePatches = [{ op: "replace", path: [], value: undefined }];
      } else {
        const [producedState, producedPatches, producedInverse] = produceWithPatches(baseState, updater) as [T, Patch[], Patch[]];
        nextState = producedState;
        patches = producedPatches;
        inversePatches = producedInverse;
      }
      if (nextState === baseState) return;
      await enforceOutboxLimit(currentDB, storageKey, ctx.maxOutboxSize, ctx.overflowStrategy as any, ctx.onOverflow);
      const previousState = baseState;
      ctx.memoryState = isDevMode() ? deepFreeze(nextState) : nextState;
      notifyListeners(ctx.memoryState);
      if (ctx.channel) ctx.channel.postMessage({ type: "SYNCRAFT_STATE_UPDATE", snapshot: ctx.memoryState });
      try {
        await persistState(currentDB, ctx.storageMode, nextState, patches);
        const outboxEntry: OutboxEntry<T> = { id: generateId(), timestamp: ctx.getMonotonicTimestamp(), patches, inversePatches };
        await pushOutbox(currentDB, outboxEntry);
      } catch (error) {
        ctx.memoryState = previousState;
        if (previousState !== undefined) notifyListeners(previousState);
        else ctx.listeners.forEach((listener) => listener(undefined as unknown as T));
        console.error(`[Syncraft Labs] Persistence failed for store "${storageKey}". Optimistic update has been rolled back.`, error);
        throw error;
      }
    },
    subscribe(listener: SyncListener<T>): Unsubscribe {
      assertNotDestroyed();
      ctx.listeners.add(listener);
      return () => ctx.listeners.delete(listener);
    },
    async getOutbox(): Promise<readonly OutboxEntry<T>[]> {
      assertNotDestroyed();
      const currentDB = assertDB();
      return readOutbox<T>(currentDB);
    },
    async clearOutbox(ids: readonly string[]): Promise<void> {
      assertNotDestroyed();
      const currentDB = assertDB();
      await clearOutboxStorage(currentDB, ids);
    },
    async compactOutbox(): Promise<readonly OutboxEntry<T>[]> {
      assertNotDestroyed();
      const currentDB = assertDB();
      const entries = await readOutbox<T>(currentDB);
      const result = compactOutboxFn(entries);
      return result ? [result.compacted] : [];
    },
    async hydrate(): Promise<T | undefined> {
      assertNotDestroyed();
      if (ctx.isHydrated && ctx.db !== null) return ctx.memoryState;
      if (ctx.hydrationPromise !== null) return ctx.hydrationPromise;
      ctx.hydrationPromise = (async () => {
        ctx.db = await openSyncDB(storageKey);
        const persisted = ctx.storageMode === "collection" ? await readCollectionState<T>(ctx.db) : await readState<T>(ctx.db);
        if (persisted !== undefined) {
          if (isDevMode()) {
            assertNoCycles(persisted, `hydrate() for store "${storageKey}"`);
            validateStateShape(persisted, `hydrate() for store "${storageKey}"`);
          }
          ctx.memoryState = isDevMode() ? deepFreeze(persisted) : persisted;
        } else if (ctx.initialState !== undefined) {
          if (isDevMode()) {
            assertNoCycles(ctx.initialState, `initialState for store "${storageKey}"`);
            validateStateShape(ctx.initialState, `initialState for store "${storageKey}"`);
          }
          ctx.memoryState = isDevMode() ? deepFreeze(ctx.initialState) : ctx.initialState;
          if (ctx.storageMode === "collection") await writeCollectionState(ctx.db, ctx.initialState);
          else await writeState(ctx.db, ctx.initialState);
        }
        ctx.isHydrated = true;
        if (ctx.memoryState !== undefined) notifyListeners(ctx.memoryState);
        return ctx.memoryState;
      })();
      try {
        return await ctx.hydrationPromise;
      } finally {
        ctx.hydrationPromise = null;
      }
    },
    get isHydrating(): boolean {
      return !ctx.isHydrated && !ctx.isDestroyed;
    },
    destroy(): void {
      if (ctx.isDestroyed) return;
      if (ctx.db !== null) {
        closeDB(ctx.db);
        ctx.db = null;
      }
      ctx.listeners.clear();
      ctx.memoryState = undefined;
      ctx.isHydrated = false;
      ctx.isDestroyed = true;
      if (ctx.channel) {
        ctx.channel.close();
        ctx.channel = null;
      }
    },
  };
  return store;
}
