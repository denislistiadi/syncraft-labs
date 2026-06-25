/**
 * @module @syncraft/vue
 *
 * Public API for the Syncraft Vue integration.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSync } from "@syncraft/vue";
 *
 * const { data, update, isHydrating } = useSync<TodoState>("todos", {
 *   initialState: { todos: [] },
 * });
 * </script>
 * ```
 */

export { useSync, destroyStore, _resetRegistry } from "./use-sync.js";
export type { UseSyncOptions, UseSyncReturn } from "./types.js";
