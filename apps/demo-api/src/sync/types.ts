import type { Patch } from "@syncraft-labs/core";

export interface SyncEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly patches: readonly Patch[];
}

export interface SyncPayload {
  readonly clientId: string;
  readonly idempotencyKey: string;
  readonly baseVersion: number;
  readonly entries: readonly SyncEntry[];
}

export interface ParsedSyncRequest {
  readonly payload: SyncPayload;
}

export interface SyncRequestError {
  readonly error: string;
  readonly message: string;
}
