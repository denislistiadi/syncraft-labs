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

// ── Factory & Utilities ───────────────────────────────────────
export { createSyncStore } from "./store/index.js";
export { applyPatches } from "./produce/index.js";
export { compactOutbox } from "./compact.js";
export {
  deepFreeze,
  assertNoCycles,
  validateStateShape,
  isUnsupportedType,
} from "./guards/index.js";
export {
  SyncraftError,
  toSyncraftError,
} from "./errors.js";
export { BASE_RETRY_DELAY, MAX_RETRY_DELAY, DEFAULT_SYNC_INTERVAL } from "./controller/constants.js";
export { BaseStoreController, type BaseControllerOptions, type ControllerSnapshot } from "./controller/base.js";

// ── Types ─────────────────────────────────────────────────────
export type {
  SyncStoreConfig,
  SyncStore,
  SyncListener,
  Unsubscribe,
  DraftUpdater,
  OutboxEntry,
  OutboxOverflowStrategy,
  OutboxOverflowInfo,
} from "./types.js";

export type {
  SyncraftErrorSource,
  SyncraftErrorOptions,
} from "./errors.js";

export type { Patch } from "./produce/index.js";
export type { CompactResult } from "./compact.js";
