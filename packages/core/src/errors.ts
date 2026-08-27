/**
 * @module @syncraft-labs/core/errors
 *
 * Structured error classes and utilities for Syncraft Labs.
 */

/**
 * Origin source of a Syncraft error.
 * - `"sync"`: Failure during background or triggered outbox push to remote server
 * - `"fetch"`: Failure during initial fetch or explicit `refetch()` from remote server
 * - `"hydration"`: Failure while loading state from IndexedDB
 * - `"store"`: Failure in core store operations (e.g. outbox limit, serialization, persistence)
 */
export type SyncraftErrorSource = "sync" | "fetch" | "hydration" | "store";

/**
 * Options for constructing a {@link SyncraftError}.
 */
export interface SyncraftErrorOptions {
  /** The system layer where the error originated. */
  readonly source: SyncraftErrorSource;
  /** Whether the failed operation can be retried. */
  readonly retryable?: boolean;
  /** The underlying cause of the error. */
  readonly cause?: unknown;
}

/**
 * Custom error class used throughout Syncraft Labs.
 *
 * Preserves the original error message and stack trace while attaching
 * structured metadata (`source`, `retryable`, `cause`) so framework adapters
 * and applications can distinguish between sync, fetch, hydration, and store errors.
 *
 * @example
 * ```ts
 * try {
 *   await refetch();
 * } catch (err) {
 *   if (err instanceof SyncraftError && err.source === "fetch") {
 *     console.error("Network fetch failed:", err.message);
 *   }
 * }
 * ```
 */
export class SyncraftError extends Error {
  readonly source: SyncraftErrorSource;
  readonly retryable: boolean;
  readonly originalError?: unknown;

  constructor(
    messageOrError: string | Error | unknown,
    options?: SyncraftErrorOptions,
  ) {
    const message =
      typeof messageOrError === "string"
        ? messageOrError
        : messageOrError instanceof Error
          ? messageOrError.message
          : String(messageOrError);

    const cause =
      options?.cause ??
      (messageOrError instanceof Error ? messageOrError : undefined);

    super(message);

    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }

    this.name = "SyncraftError";
    this.source =
      options?.source ??
      (messageOrError instanceof SyncraftError
        ? messageOrError.source
        : "store");
    this.retryable =
      options?.retryable ??
      (messageOrError instanceof SyncraftError
        ? messageOrError.retryable
        : false);
    this.originalError =
      messageOrError instanceof Error ? messageOrError : undefined;

    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Normalize an arbitrary thrown value into a typed {@link SyncraftError}.
 *
 * If the value is already a `SyncraftError`, it is returned directly unless
 * overriding options are explicitly provided.
 *
 * @param error - The thrown value (Error, string, or unknown).
 * @param source - The source category to assign if not already a SyncraftError.
 * @param retryable - Whether the operation is retryable.
 * @returns A normalized `SyncraftError` instance.
 */
export function toSyncraftError(
  error: unknown,
  source: SyncraftErrorSource,
  retryable = false,
): SyncraftError {
  if (error instanceof SyncraftError) {
    return error;
  }
  return new SyncraftError(error, {
    source,
    retryable,
    cause: error,
  });
}
