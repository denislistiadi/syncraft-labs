/**
 * @module @syncraft-labs/vue
 *
 * Public API for the Syncraft Labs Vue integration.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSync } from "@syncraft-labs/vue";
 *
 * const { data, update, isHydrating } = useSync<TodoState>("todos", {
 *   initialState: { todos: [] },
 * });
 * </script>
 * ```
 */

export { useSync, destroyStore, _resetRegistry } from "./use-sync.js";
export { createSyncraft } from "./plugin.js";
export type { UseSyncOptions, UseSyncReturn } from "./types.js";
