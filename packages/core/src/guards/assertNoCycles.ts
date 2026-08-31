export function assertNoCycles(
  obj: unknown,
  context?: string,
  path: (string | number)[] = [],
  ancestors: Set<object> = new Set(),
): void {
  if (obj === null || typeof obj !== "object") return;
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
    for (let i = 0; i < target.length; i++) assertNoCycles(target[i], context, [...path, i], ancestors);
  } else if (target instanceof Map) {
    for (const [key, value] of target) assertNoCycles(value, context, [...path, "$entries", String(key)], ancestors);
  } else if (target instanceof Set) {
    let idx = 0;
    for (const value of target) {
      if (value !== null && typeof value === "object") assertNoCycles(value, context, [...path, "$values", String(idx)], ancestors);
      idx++;
    }
  } else {
    for (const key of Object.keys(target)) assertNoCycles((target as Record<string, unknown>)[key], context, [...path, key], ancestors);
  }
  ancestors.delete(target);
}
