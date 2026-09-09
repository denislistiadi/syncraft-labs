/**
 * @module @syncraft-labs/core/controller/conflict
 *
 * Conflict resolution algorithms and helper functions for reconciling
 * optimistic local state with incoming authoritative remote state.
 */

import { SyncraftError } from "../errors.js";
import type { Patch } from "../produce/types.js";
import type { ConflictResolver, ConflictStrategy } from "../types/config.js";

/**
 * Configuration passed to the {@link resolveConflict} engine.
 *
 * @template T - The state shape.
 */
export interface ConflictResolutionConfig<T> {
  /**
   * Strategy to resolve conflict:
   * - `"lastWriteWins"`: Remote authoritative state overwrites local pending state.
   * - `"custom"`: Resolves conflict via user-provided three-way merge function.
   */
  readonly strategy: ConflictStrategy;
  /**
   * Custom resolver function. Required when `strategy` is `"custom"`.
   */
  readonly resolver?: ConflictResolver<T> | undefined;
}

/**
 * Resolves state conflicts between local and incoming remote states.
 *
 * Pure function with zero external side-effects:
 * - When `strategy` is `"lastWriteWins"`, returns the incoming `remoteState` as the source of truth.
 * - When `strategy` is `"custom"`, invokes `config.resolver` with `(local, remote, base, patches)`.
 *
 * @template T - The state shape (must be an object).
 * @param localState - Current local state in memory / client store.
 * @param remoteState - Incoming remote state from server / peer.
 * @param baseState - Last synchronized common ancestor snapshot.
 * @param localPatches - List of uncommitted local patches pending synchronization.
 * @param config - Conflict resolution strategy and optional custom resolver.
 * @returns The resolved state object to persist and emit.
 *
 * @throws {SyncraftError} If `strategy` is `"custom"` but `resolver` is omitted or throws.
 *
 * @example
 * ```ts
 * const resolved = resolveConflict(
 *   { title: "Local Draft", body: "v1" },
 *   { title: "Remote Server", body: "v2" },
 *   { title: "Base Title", body: "v0" },
 *   patches,
 *   {
 *     strategy: "custom",
 *     resolver: ({ local, remote, base }) => ({
 *       title: local.title !== base.title ? local.title : remote.title,
 *       body: remote.body,
 *     }),
 *   }
 * );
 * ```
 */
export function resolveConflict<T extends Record<string, unknown>>(
  localState: T,
  remoteState: T,
  baseState: T,
  localPatches: readonly Patch[],
  config: ConflictResolutionConfig<T>,
): T {
  if (config.strategy === "custom") {
    if (typeof config.resolver !== "function") {
      throw new SyncraftError(
        '[Syncraft Labs] Conflict strategy is set to "custom" but no resolver function was provided.',
        { source: "sync", retryable: false },
      );
    }

    try {
      return config.resolver({
        local: localState,
        remote: remoteState,
        base: baseState,
        patches: localPatches,
      });
    } catch (resolverErr) {
      throw new SyncraftError(
        `[Syncraft Labs] Custom conflict resolver threw an unexpected error: ${
          resolverErr instanceof Error ? resolverErr.message : String(resolverErr)
        }`,
        { source: "sync", retryable: false, cause: resolverErr },
      );
    }
  }

  // Default "lastWriteWins" strategy: remote state takes precedence
  return remoteState;
}
