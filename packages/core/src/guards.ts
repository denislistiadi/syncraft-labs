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
 * WeakSet tracking Date instances that have already emitted a dev warning.
 * Prevents repeated console.warn spam on every mutation cycle.
 * GC-safe: WeakSet does not hold strong references.
 */
const warnedDates = new WeakSet<object>();

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

/**
 * Check whether a value is an unsupported type for state persistence and proxy drafting.
 *
 * Supported types:
 * - Primitives (number, string, boolean, null, undefined, symbol, bigint)
 * - Plain objects (object literals, Object.create(null))
 * - Arrays
 * - Date instances (allowed as leaf values)
 *
 * Unsupported types:
 * - Functions
 * - Custom class instances
 * - Built-in collection and utility types (Map, Set, WeakMap, WeakSet, RegExp, Error, Promise, ArrayBuffer, TypedArray)
 *
 * @param value - The value to check.
 * @returns `true` if the value is an unsupported type.
 */
export function isUnsupportedType(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return typeof value === "function";
  }

  if (
    value instanceof Date ||
    Object.prototype.toString.call(value) === "[object Date]"
  ) {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto !== Object.prototype && proto !== null;
}

/**
 * Validate that an object tree contains only supported state types (plain objects, arrays, primitives, and Date leaves).
 *
 * Emits a console warning when a `Date` instance is found, reminding developers that Dates must be replaced wholesale.
 * Throws an explicit Error when unsupported types (such as custom class instances, Map, Set, RegExp, etc.) are detected.
 *
 * Correctly handles shared DAG (Directed Acyclic Graph) references via WeakSet tracking.
 *
 * @param obj - The state value or object tree to validate.
 * @param context - Optional context string for warning/error messages (e.g., 'hydrate()').
 * @param path - Current traversal path stack.
 * @param seen - WeakSet tracking visited objects to prevent redundant traversal in DAGs.
 */
export function validateStateShape(
  obj: unknown,
  context?: string,
  path: (string | number)[] = [],
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "function") {
      const pathStr = path.length > 0 ? path.join(".") : "<root>";
      const contextStr = context ? ` during ${context}` : "";
      throw new Error(
        `[Syncraft Labs] Unsupported type "Function" detected at path "${pathStr}"${contextStr}. State must only contain plain objects, arrays, and primitives.`,
      );
    }
    return;
  }

  // Handle proxy targets if a draft proxy is passed
  const target =
    typeof (obj as { __target?: object }).__target === "object" &&
    (obj as { __target?: object }).__target !== null
      ? ((obj as { __target: object }).__target as object)
      : (obj as object);

  if (seen.has(target)) {
    return;
  }
  seen.add(target);

  const pathStr = path.length > 0 ? path.join(".") : "<root>";
  const contextStr = context ? ` during ${context}` : "";

  // Date is allowed as a leaf value, but we emit a warning in development mode
  if (
    target instanceof Date ||
    Object.prototype.toString.call(target) === "[object Date]"
  ) {
    if (!warnedDates.has(target)) {
      warnedDates.add(target);
      console.warn(
        `[Syncraft Labs] Date detected at path "${pathStr}"${contextStr} — Dates are allowed as leaf values but must be replaced wholesale rather than having their fields mutated. Consider using ISO strings or timestamps instead.`,
      );
    }
    return;
  }

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      validateStateShape(target[i], context, [...path, i], seen);
    }
    return;
  }

  const proto = Object.getPrototypeOf(target);
  const isPlain = proto === Object.prototype || proto === null;

  if (!isPlain) {
    const constructorName =
      (target as { constructor?: { name?: string } }).constructor?.name ||
      Object.prototype.toString.call(target).slice(8, -1) ||
      "ClassInstance";
    throw new Error(
      `[Syncraft Labs] Unsupported type "${constructorName}" detected at path "${pathStr}"${contextStr}. State must only contain plain objects, arrays, and primitives. Use a plain object instead.`,
    );
  }

  for (const key of Object.keys(target)) {
    validateStateShape(
      (target as Record<string, unknown>)[key],
      context,
      [...path, key],
      seen,
    );
  }
}

