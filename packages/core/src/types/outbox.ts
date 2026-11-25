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

/**
 * Per-entry push acknowledgement status.
 *
 * - `applied`: the server committed the mutation; the entry is removed.
 * - `conflict`: the server rejected the mutation because of a version
 *   conflict; the entry is removed and reported through `onPushResult`.
 * - `rejected`: the server permanently refused the mutation (validation,
 *   authorization); the entry is removed and reported through `onPushResult`.
 * - `retry`: the mutation was not applied and should be retried; the entry is
 *   kept in the outbox.
 */
export type OutboxAckStatus = "applied" | "conflict" | "rejected" | "retry";

export interface OutboxAckError {
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
}

/**
 * Acknowledgement returned by the `pusher` for a single outbox entry.
 *
 * Pushed entries missing from the acknowledgement list are treated as
 * `retry`, so a partial response never drops unconfirmed mutations.
 */
export interface OutboxAck {
  /** `OutboxEntry.id` of the acknowledged mutation. */
  readonly id: string;
  readonly status: OutboxAckStatus;
  readonly error?: OutboxAckError;
}

/**
 * Push handler contract.
 *
 * Return an `OutboxAck` for every entry you processed. Returning `void` keeps
 * backward-compatible behaviour: every pushed entry is treated as `applied`.
 */
export type PushHandler<T = unknown> = (
  entries: readonly OutboxEntry<T>[],
) => Promise<void | readonly OutboxAck[]>;

