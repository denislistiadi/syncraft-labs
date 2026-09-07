const warnedDates = new WeakSet<object>();

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
      throw new Error(`[Syncraft Labs] Unsupported type "Function" detected at path "${pathStr}"${contextStr}. State must only contain plain objects, arrays, and primitives.`);
    }
    return;
  }
  const target =
    typeof (obj as { __target?: object }).__target === "object" &&
    (obj as { __target?: object }).__target !== null
      ? ((obj as { __target: object }).__target as object)
      : (obj as object);
  if (seen.has(target)) return;
  seen.add(target);
  const pathStr = path.length > 0 ? path.join(".") : "<root>";
  const contextStr = context ? ` during ${context}` : "";
  if (target instanceof Date || Object.prototype.toString.call(target) === "[object Date]") {
    if (!warnedDates.has(target)) {
      warnedDates.add(target);
      console.warn(
        `[Syncraft Labs] Date detected at path "${pathStr}"${contextStr} — Dates are allowed as leaf values but must be replaced wholesale rather than having their fields mutated. Consider using ISO strings or timestamps instead.`,
      );
    }
    return;
  }
  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) validateStateShape(target[i], context, [...path, i], seen);
    return;
  }
  if (target instanceof Map) {
    for (const [key, value] of target) validateStateShape(value, context, [...path, "$entries", String(key)], seen);
    return;
  }
  if (target instanceof Set) {
    let idx = 0;
    for (const value of target) {
      if (value !== null && typeof value === "object") validateStateShape(value, context, [...path, "$values", String(idx)], seen);
      idx++;
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
  for (const key of Object.keys(target)) validateStateShape((target as Record<string, unknown>)[key], context, [...path, key], seen);
}
