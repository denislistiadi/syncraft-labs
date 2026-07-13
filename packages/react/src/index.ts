/**
 * @module @syncraft-labs/react
 *
 * Public API for the Syncraft Labs React integration.
 *
 * @example
 * ```tsx
 * import { useSync } from "@syncraft-labs/react";
 *
 * function TodoList() {
 *   const { data, update, isHydrating } = useSync<TodoState>("todos", {
 *     initialState: { todos: [] },
 *   });
 *
 *   if (isHydrating) return <p>Loading…</p>;
 *
 *   return (
 *     <ul>
 *       {data?.todos.map((t) => (
 *         <li key={t.id}>{t.text}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */

export { useSync, useSyncSuspense, destroyStore, _resetRegistry } from "./use-sync.js";
export { SyncraftProvider, useStoreRegistry } from "./provider.js";
export type { SyncraftProviderProps } from "./provider.js";
export type { UseSyncOptions, UseSyncReturn } from "./types.js";
