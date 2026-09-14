/**
 * @module @syncraft-labs/core/storage/quota
 *
 * Cross-browser detection utilities for browser storage quota limits
 * (IndexedDB / Web Storage QuotaExceededError).
 */

/**
 * Checks whether an unknown error object represents a browser storage quota exceeded error.
 *
 * Cross-browser compatibility:
 * - **Chromium** (Chrome, Edge, Opera): `DOMException` with `name === "QuotaExceededError"` (code 22).
 * - **Firefox** (Gecko): `DOMException` with `name === "QuotaExceededError"` or `name === "NS_ERROR_DOM_QUOTA_REACHED"`.
 * - **WebKit** (Safari, iOS Mobile Safari): `DOMException` with `name === "QuotaExceededError"` or `code === 22`.
 * - **Polyfills / Mock Environments**: Duck-typed property check.
 *
 * @param error - The caught unknown error to evaluate.
 * @returns `true` if the error indicates storage quota exhaustion; otherwise `false`.
 *
 * @example
 * ```ts
 * try {
 *   await store.set((draft) => { ... });
 * } catch (err) {
 *   if (isQuotaExceededError(err)) {
 *     console.error("IndexedDB storage quota exceeded!");
 *   }
 * }
 * ```
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  // DOMException instance check if DOMException is available in environment
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22
    );
  }

  // Fallback / Duck-typing check for simulated, polyfilled, or SSR environments
  const errObj = error as { name?: unknown; code?: unknown; number?: unknown };
  return (
    errObj.name === "QuotaExceededError" ||
    errObj.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    errObj.code === 22 ||
    errObj.number === -2147024882 // Legacy Internet Explorer / Edge error number
  );
}
