/**
 * @module @syncraft-labs/core/storage/withQuotaGuard
 *
 * Guard utility for wrapping asynchronous storage operations and normalizing
 * quota exceeded failures into typed `SyncraftError` instances with callback telemetry.
 */

import { SyncraftError } from "../errors.js";
import { isQuotaExceededError } from "./quota.js";

/**
 * Metadata emitted when a storage quota limit is exceeded.
 */
export interface QuotaExceededInfo {
  /** The unique storage key of the affected store. */
  readonly storageKey: string;
  /** The specific storage operation during which quota was exceeded. */
  readonly operation:
    | "writeState"
    | "pushOutbox"
    | "writeCollectionState"
    | "writeCollectionEntities"
    | "hydrate";
}

/**
 * Callback handler invoked when browser storage quota is exceeded.
 */
export type QuotaExceededHandler = (
  info: QuotaExceededInfo,
) => void | Promise<void>;

/**
 * Wraps an asynchronous storage operation with quota detection and error normalization.
 *
 * If the wrapped operation throws a `QuotaExceededError`:
 * 1. Invokes the optional `handler` callback with operation metadata.
 * 2. Wraps and re-throws the error as a structured `SyncraftError` (`source: "store"`, `retryable: false`).
 *
 * If any other error occurs, it is re-thrown untouched.
 *
 * @template R - The return type of the operation.
 * @param operation - The asynchronous function executing the storage command.
 * @param info - Contextual metadata identifying the store and operation.
 * @param handler - Optional user callback invoked upon quota exhaustion.
 * @returns The resolved result of `operation`.
 *
 * @throws {SyncraftError} If storage quota is exceeded.
 * @throws {unknown} Any other non-quota storage error.
 */
export async function withQuotaGuard<R>(
  operation: () => Promise<R>,
  info: QuotaExceededInfo,
  handler?: QuotaExceededHandler,
): Promise<R> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (isQuotaExceededError(error)) {
      if (typeof handler === "function") {
        try {
          await handler(info);
        } catch (handlerErr) {
          console.warn(
            `[Syncraft Labs] Error inside onQuotaExceeded handler for "${info.storageKey}":`,
            handlerErr,
          );
        }
      }

      throw new SyncraftError(
        `[Syncraft Labs] IndexedDB quota exceeded during "${info.operation}" for store "${info.storageKey}". ` +
          `Consider lowering maxOutboxSize, enabling aggressive compaction, or clearing stale persisted data.`,
        { source: "store", retryable: false, cause: error },
      );
    }

    throw error;
  }
}
