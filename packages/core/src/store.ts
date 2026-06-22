/**
 * @module @syncraft/core/store
 *
 * The heart of Syncraft: the `createSyncStore` factory.
 *
 * Data flow for a `set()` call:
 *
 *   User calls set(draft => { ... })
 *           │
 *           ▼
 *   ┌─────────────────────────────┐
 *   │  Immer produceWithPatches   │ ── Generates: nextState, patches, inversePatches
 *   └─────────────────────────────┘
 *           │
 *           ├──▶ Update in-memory cache (instant, optimistic)
 *           │
 *           ├──▶ Write to IndexedDB (durable, async)
 *           │
 *           ├──▶ Push OutboxEntry to IndexedDB (for eventual sync)
 *           │
 *           └──▶ Notify all subscribers (triggers React/Vue re-render)
 *
 * The `get()` method has a two-tier strategy:
 * - HOT PATH:  Returns in-memory cache (synchronous via getSnapshot)
 * - COLD PATH: Falls back to IndexedDB read (async, first load only)
 *
 * Hydration lifecycle:
 * 1. Store is created → in-memory cache is `undefined`
 * 2. `hydrate()` is called → reads IndexedDB → populates cache
 * 3. All subsequent `getSnapshot()` calls return from memory
 */

import { enablePatches, produceWithPatches, type Patch } from "immer";
import type {
  DraftUpdater,
  OutboxEntry,
  SyncListener,
  SyncStore,
  SyncStoreConfig,
  Unsubscribe,
} from "./types.js";
import {
  closeDB,
  openSyncDB,
  pushOutbox,
  readOutbox,
  readState,
  writeState,
  clearOutbox as clearOutboxStorage,
} from "./storage.js";
import type { IDBPDatabase } from "idb";

// ─────────────────────────────────────────────────────────────
// Enable Immer Patches (must be called once, globally)
// ─────────────────────────────────────────────────────────────

/**
 * Immer patches are opt-in for bundle size reasons.
 * We enable them here since patch generation is core to Syncraft's
 * outbox strategy. This is safe to call multiple times.
 */
enablePatches();

// ─────────────────────────────────────────────────────────────
// UUID Generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate a unique ID for outbox entries.
 * Uses `crypto.randomUUID()` which is available in all modern browsers
 * and Node.js 19+. Falls back to a timestamp-based ID for older runtimes.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random suffix (not truly UUID, but unique enough)
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ─────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────

/**
 * Create a new SyncStore instance.
 *
 * This is the primary entry point for @syncraft/core.
 * Each store manages one slice of state identified by `storageKey`.
 *
 * @template T - The shape of the state. Must be an object (Immer requirement).
 *
 * @example
 * ```ts
 * interface TodoState {
 *   todos: Array<{ id: string; text: string; done: boolean }>;
 * }
 *
 * const store = createSyncStore<TodoState>({
 *   storageKey: "my-todos",
 *   initialState: { todos: [] },
 * });
 *
 * // Hydrate from IndexedDB on startup
 * await store.hydrate();
 *
 * // Read state (instant from memory after hydration)
 * const state = store.getSnapshot(); // TodoState | undefined
 *
 * // Mutate with Immer drafts — optimistic, instant
 * await store.set((draft) => {
 *   draft.todos.push({ id: "1", text: "Ship Syncraft", done: false });
 * });
 * ```
 *
 * @param config - Store configuration.
 * @returns A fully initialized SyncStore instance.
 */
export function createSyncStore<T extends object>(
  config: SyncStoreConfig<T>,
): SyncStore<T> {
  const { storageKey, initialState } = config;

  // ── Internal State ──────────────────────────────────────────

  /**
   * In-memory cache of the current state.
   * This is the "hot" copy — reads from `getSnapshot()` are synchronous.
   * Starts as `undefined` until `hydrate()` populates it.
   */
  let memoryState: T | undefined = undefined;

  /**
   * Set of active listeners. We use a Set for O(1) add/delete.
   * Listeners are called synchronously after every `set()`.
   */
  const listeners = new Set<SyncListener<T>>();

  /**
   * The IndexedDB handle. Initialized lazily during `hydrate()`.
   * Typed as the loose `IDBPDatabase<unknown>` from our storage module.
   */
  let db: IDBPDatabase<unknown> | null = null;

  /**
   * Flag to track whether `hydrate()` has been called.
   * Prevents double-hydration and enables safety checks in `set()`.
   */
  let isHydrated = false;

  /**
   * Flag to track whether `destroy()` has been called.
   * Prevents operations on a closed store.
   */
  let isDestroyed = false;

  /**
   * Guard flag to prevent spamming the dev warning in `getSnapshot()`.
   * Once we've warned once per store instance, we don't warn again.
   */
  let hasWarnedPreHydration = false;

  // ── Helper Functions ────────────────────────────────────────

  /**
   * Notify all subscribers with the current state.
   * Called synchronously after every state change for instant UI updates.
   */
  function notifyListeners(state: T): void {
    listeners.forEach((listener) => {
      listener(state);
    });
  }

  /**
   * Assert that the store hasn't been destroyed.
   * Throws a descriptive error if operations are attempted after destroy.
   */
  function assertNotDestroyed(): void {
    if (isDestroyed) {
      throw new Error(
        `[Syncraft] Store "${storageKey}" has been destroyed. ` +
          `Create a new store instance if you need to continue using this key.`,
      );
    }
  }

  /**
   * Assert that the database connection is available.
   * This should always be true after hydrate() has been called.
   */
  function assertDB(): IDBPDatabase<unknown> {
    if (db === null) {
      throw new Error(
        `[Syncraft] Store "${storageKey}" database is not initialized. ` +
          `Call hydrate() before performing operations.`,
      );
    }
    return db;
  }

  // ── Public API ──────────────────────────────────────────────

  const store: SyncStore<T> = {
    async get(): Promise<T | undefined> {
      assertNotDestroyed();

      // Hot path: return from memory if already hydrated
      if (memoryState !== undefined) {
        return memoryState;
      }

      // Cold path: read from IndexedDB (only happens before/during hydration)
      if (db !== null) {
        const persisted = await readState<T>(db);
        if (persisted !== undefined) {
          memoryState = persisted;
          return persisted;
        }
      }

      return initialState;
    },

    getSnapshot(): T | undefined {
      // Pure synchronous read — no async, no IndexedDB.
      // Returns undefined until hydrate() completes.
      // This is the fast path for React's useSyncExternalStore.

      // ── DEV WARNING: detect forgotten hydrate() calls ───────
      // Only fires once per store instance, and only in non-production
      // environments, to avoid console spam in prod.
      //
      // We access `process.env` via globalThis to avoid requiring
      // @types/node in this browser-first library. Bundlers like Vite
      // and webpack replace `process.env.NODE_ENV` at build time.
      if (
        !isHydrated &&
        !isDestroyed &&
        !hasWarnedPreHydration
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- safe runtime check for process.env
        const nodeEnv = (globalThis as Record<string, unknown>).process as
          | { env?: { NODE_ENV?: string } }
          | undefined;
        const isProd = nodeEnv?.env?.NODE_ENV === "production";

        if (!isProd) {
          hasWarnedPreHydration = true;
          console.warn(
            `[Syncraft] getSnapshot() called on store "${storageKey}" before hydrate() completed. ` +
              `This usually means the store hasn't finished loading from IndexedDB yet. ` +
              `Did you forget to await store.hydrate() or use the isHydrating state in your UI?`,
          );
        }
      }

      return memoryState;
    },

    async set(updater: DraftUpdater<T>): Promise<void> {
      assertNotDestroyed();
      const currentDB = assertDB();

      // Determine the base state for the mutation.
      // If we have memory state, use it. Otherwise use initialState.
      // If neither exists, we can't produce a draft — throw early.
      const baseState = memoryState ?? initialState;

      if (baseState === undefined) {
        throw new Error(
          `[Syncraft] Cannot call set() on store "${storageKey}" — no state exists. ` +
            `Either provide an initialState in the config, call hydrate() first, ` +
            `or ensure the store has been populated via a fetcher.`,
        );
      }

      // ── Immer: Produce next state with patches ──────────────
      //
      // `produceWithPatches` returns a tuple:
      //   [nextState, patches, inversePatches]
      //
      // - patches:        What changed (for the server / CRDT)
      // - inversePatches: How to undo it (for rollback on server rejection)
      //
      const [nextState, patches, inversePatches] = produceWithPatches(
        baseState,
        updater,
      ) as [T, Patch[], Patch[]];

      // Skip no-op updates (Immer returns the same reference if nothing changed)
      if (nextState === baseState) {
        return;
      }

      // ── Optimistic Update with Pessimistic Rollback ─────────
      //
      // Strategy:
      //   1. Save previous state as rollback target
      //   2. Update memory + notify (optimistic — UI updates instantly)
      //   3. Try to persist to IndexedDB
      //   4. If persistence fails → revert memory + re-notify (rollback)
      //
      // This ensures the UI is never stuck in a state that doesn't
      // match what's actually persisted in IndexedDB.

      const previousState = baseState;

      // ── 1. Update in-memory cache (instant, optimistic) ─────
      memoryState = nextState;

      // ── 2. Notify subscribers (triggers React/Vue re-render) ─
      // This happens BEFORE the IndexedDB write completes.
      // The UI updates instantly — that's the "optimistic" in optimistic UI.
      notifyListeners(nextState);

      // ── 3. Persist to IndexedDB with rollback on failure ────
      try {
        await writeState(currentDB, nextState);

        // ── 4. Append to outbox (for eventual sync) ─────────────
        const outboxEntry: OutboxEntry<T> = {
          id: generateId(),
          timestamp: Date.now(),
          patches,
          inversePatches,
          snapshot: nextState,
        };

        await pushOutbox(currentDB, outboxEntry);
      } catch (error) {
        // ── ROLLBACK: Revert optimistic update ──────────────────
        //
        // The IndexedDB write failed. The in-memory state is now
        // ahead of what's persisted. We must revert to keep them
        // in sync, otherwise the UI would show data that isn't
        // durable (would be lost on page refresh).

        memoryState = previousState;
        notifyListeners(previousState);

        // Log with Syncraft prefix for easy filtering in DevTools
        console.error(
          `[Syncraft] Persistence failed for store "${storageKey}". ` +
            `Optimistic update has been rolled back.`,
          error,
        );

        // Re-throw so the caller's await/catch can handle it
        // (e.g., show a "Save failed" toast)
        throw error;
      }
    },

    subscribe(listener: SyncListener<T>): Unsubscribe {
      assertNotDestroyed();

      listeners.add(listener);

      // Return the unsubscribe function
      return () => {
        listeners.delete(listener);
      };
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

    async hydrate(): Promise<T | undefined> {
      assertNotDestroyed();

      // Prevent double-hydration
      if (isHydrated && db !== null) {
        return memoryState;
      }

      // Open the IndexedDB connection
      db = await openSyncDB(storageKey);

      // Read persisted state
      const persisted = await readState<T>(db);

      if (persisted !== undefined) {
        // We have persisted data — use it as the source of truth
        memoryState = persisted;
      } else if (initialState !== undefined) {
        // No persisted data, but we have an initial state — persist it
        memoryState = initialState;
        await writeState(db, initialState);
      }
      // else: no persisted data, no initial state → memoryState stays undefined

      isHydrated = true;

      // Notify listeners so the UI can render the hydrated state
      if (memoryState !== undefined) {
        notifyListeners(memoryState);
      }

      return memoryState;
    },

    get isHydrating(): boolean {
      // True when the store has been created but hydrate() hasn't
      // completed yet (and the store hasn't been destroyed).
      // Framework wrappers use this to show loading skeletons.
      return !isHydrated && !isDestroyed;
    },

    destroy(): void {
      if (isDestroyed) {
        return; // Idempotent
      }

      // Close the IndexedDB connection
      if (db !== null) {
        closeDB(db);
        db = null;
      }

      // Clear all listeners to prevent memory leaks
      listeners.clear();

      // Reset state
      memoryState = undefined;
      isHydrated = false;
      isDestroyed = true;
    },
  };

  return store;
}
