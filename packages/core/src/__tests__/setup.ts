/**
 * Vitest setup file for @syncraft/core tests.
 *
 * Injects `fake-indexeddb` into the global scope so that the `idb` library
 * (which uses the global `indexedDB` API) works in Node.js.
 *
 * This is imported automatically via vitest.config.ts `setupFiles`.
 */
import "fake-indexeddb/auto";
