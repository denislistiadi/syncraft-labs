import type { Patch } from "../produce/index.js";

export interface OutboxEntry<_T = unknown> {
  readonly id: string;
  readonly timestamp: number;
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}

export interface ArchivedOutboxEntry<_T = unknown> extends OutboxEntry<_T> {
  readonly archivedAt: number;
  readonly syncStatus: "synced";
}

