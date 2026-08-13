/**
 * @module @syncraft-labs/core/compact
 *
 * Pure function utility for outbox compaction.
 * Merges consecutive mutations touching the same path into a single outbox entry.
 */

import type { Patch } from "./produce.js";
import type { OutboxEntry } from "./types.js";

/**
 * Generate a unique ID for the compacted outbox entry.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Result of compacting an array of outbox entries.
 */
export interface CompactResult<T = unknown> {
  /** The single compacted outbox entry containing deduplicated patches. */
  readonly compacted: OutboxEntry<T>;
  /** Array of original outbox entry IDs that were merged. */
  readonly originalIds: readonly string[];
}

/**
 * Compact an array of outbox entries by merging consecutive mutations to the same path.
 *
 * Algorithm (Last-Write-Wins per path):
 * - Iterates chronologically over entries and patches.
 * - Deduplicates patches by JSON path (e.g. `["todos", 0, "text"]`).
 * - Keeps the latest patch value for each path.
 * - Preserves the initial inverse patch for rollback back to the pre-compaction state.
 * - Cancels out additions followed by removals on the same path.
 * - A root replacement (`path: []`) resets all prior path entries.
 *
 * @template T - The state shape.
 * @param entries - Array of outbox entries to compact.
 * @return Compacted entry and original IDs, or `null` if the input is empty.
 *
 * @example
 * ```ts
 * const result = compactOutbox(outbox);
 * if (result) {
 *   await pusher([result.compacted]);
 *   await store.clearOutbox(result.originalIds);
 * }
 * ```
 */
export function compactOutbox<T = unknown>(
  entries: readonly OutboxEntry<T>[],
): CompactResult<T> | null {
  if (entries.length === 0) {
    return null;
  }

  const originalIds = entries.map((e) => e.id);

  if (entries.length === 1) {
    return {
      compacted: entries[0]!,
      originalIds,
    };
  }

  const pathMap = new Map<
    string,
    { patch: Patch; originalInverse: Patch }
  >();
  const orderedKeys: string[] = [];

  for (const entry of entries) {
    const patches = entry.patches;
    const inversePatches = entry.inversePatches;

    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i]!;
      const inverse = inversePatches[i];
      const pathKey = JSON.stringify(patch.path);

      if (patch.path.length === 0 && patch.op === "replace") {
        // Root replacement supersedes all prior path modifications
        pathMap.clear();
        orderedKeys.length = 0;
      }

      if (!pathMap.has(pathKey)) {
        orderedKeys.push(pathKey);
        pathMap.set(pathKey, {
          patch: { ...patch },
          originalInverse: inverse
            ? { ...inverse }
            : { op: "replace", path: patch.path },
        });
      } else {
        const existing = pathMap.get(pathKey)!;

        if (existing.patch.op === "add" && patch.op === "remove") {
          // Path was added and then removed in the same un-synced window → cancel out
          pathMap.delete(pathKey);
          const keyIdx = orderedKeys.indexOf(pathKey);
          if (keyIdx !== -1) {
            orderedKeys.splice(keyIdx, 1);
          }
        } else if (existing.patch.op === "add" && patch.op === "replace") {
          // Path was added then modified → keep 'add' op with the updated value
          existing.patch.value = patch.value;
        } else {
          // Last-write-wins: update patch to latest value, preserve original inverse
          existing.patch = { ...patch };
        }
      }
    }
  }

  const compactedPatches: Patch[] = [];
  const compactedInversePatches: Patch[] = [];

  for (const key of orderedKeys) {
    const item = pathMap.get(key);
    if (item) {
      compactedPatches.push(item.patch);
    }
  }

  // Inverse patches apply in reverse order
  for (let i = orderedKeys.length - 1; i >= 0; i--) {
    const key = orderedKeys[i]!;
    const item = pathMap.get(key);
    if (item) {
      compactedInversePatches.push(item.originalInverse);
    }
  }

  const latestEntry = entries[entries.length - 1]!;

  const compacted: OutboxEntry<T> = {
    id: generateId(),
    timestamp: latestEntry.timestamp,
    patches: compactedPatches,
    inversePatches: compactedInversePatches,
  };

  return {
    compacted,
    originalIds,
  };
}
