/**
 * @module @syncraft-labs/core
 *
 * Public API surface for the Syncraft Labs core library.
 *
 * @example
 * ```ts
 * import { createSyncStore } from "@syncraft-labs/core";
 * import type { SyncStore, OutboxEntry } from "@syncraft-labs/core";
 *
 * const store = createSyncStore<MyState>({
 *   storageKey: "my-app-state",
 *   initialState: { count: 0 },
 * });
 *
 * await store.hydrate();
 * await store.set((draft) => { draft.count += 1; });
 * ```
 */

// ── Factory ───────────────────────────────────────────────────
export { createSyncStore } from "./store.js";

// ── Types ─────────────────────────────────────────────────────
export type {
  SyncStoreConfig,
  SyncStore,
  SyncListener,
  Unsubscribe,
  DraftUpdater,
  OutboxEntry,
} from "./types.js";

export type { Patch } from "./produce.js";
