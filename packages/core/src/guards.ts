/**
 * @module @syncraft-labs/core/guards
 *
 * Development-mode guards and safety utilities.
 * These utilities are designed to detect common developer mistakes early
 * during development while incurring zero overhead in production.
 */

/**
 * Check whether the current runtime environment is in development mode (non-production).
 *
 * Checks `process.env.NODE_ENV` via `globalThis` safely across browser,
 * Node.js, and modern bundlers (Vite, Webpack, Rollup) without requiring Node.js types.
 */
export function isDevMode(): boolean {
  const nodeEnv = (globalThis as Record<string, unknown>).process as
    | { env?: { NODE_ENV?: string } }
    | undefined;
  return nodeEnv?.env?.NODE_ENV !== "production";
}

/**
 * Deep-freeze an object or array in place using `Object.freeze()`.
 * Protects state from accidental direct mutations outside of `store.set()`.
 *
 * Safely handles:
 * - Primitive values (numbers, strings, booleans, null, undefined)
 * - Plain objects and nested objects
 * - Arrays and nested arrays
 * - Shared references / DAG structures (via WeakSet tracking)
 *
 * @param obj - The object or value to freeze.
 * @param seen - Internal WeakSet tracking visited objects to prevent cycles.
 * @returns The frozen object.
 */
export function deepFreeze<T>(obj: T, seen = new WeakSet<object>()): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (seen.has(obj as object)) {
    return obj;
  }
  seen.add(obj as object);

  Object.freeze(obj);

  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (
      desc &&
      "value" in desc &&
      desc.value !== null &&
      typeof desc.value === "object"
    ) {
      deepFreeze(desc.value, seen);
    }
  }

  return obj;
}

/**
 * Detect circular references in an object tree.
 * Throws an Error with the property path where the cycle was found.
 *
 * Correctly differentiates between circular references (which throw) and
 * shared DAG (Directed Acyclic Graph) references (which are valid and allowed).
 *
 * @param obj - The object or array tree to validate.
 * @param context - Optional context string for the error message (e.g. 'hydrate').
 * @param path - Current traversal path stack.
 * @param ancestors - Set of active ancestor objects on the current branch.
 */
export function assertNoCycles(
  obj: unknown,
  context?: string,
  path: (string | number)[] = [],
  ancestors: Set<object> = new Set(),
): void {
  if (obj === null || typeof obj !== "object") {
    return;
  }

  // Handle proxy targets if a draft proxy is passed
  const target =
    typeof (obj as { __target?: object }).__target === "object" &&
    (obj as { __target?: object }).__target !== null
      ? ((obj as { __target: object }).__target as object)
      : (obj as object);

  if (ancestors.has(target)) {
    const pathStr = path.length > 0 ? path.join(".") : "<root>";
    const contextStr = context ? ` during ${context}` : "";
    throw new Error(
      `[Syncraft Labs] Circular reference detected at path "${pathStr}"${contextStr}. ` +
        `State must be a plain acyclic object tree.`,
    );
  }

  ancestors.add(target);

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      assertNoCycles(target[i], context, [...path, i], ancestors);
    }
  } else {
    for (const key of Object.keys(target)) {
      assertNoCycles(
        (target as Record<string, unknown>)[key],
        context,
        [...path, key],
        ancestors,
      );
    }
  }

  ancestors.delete(target);
}
