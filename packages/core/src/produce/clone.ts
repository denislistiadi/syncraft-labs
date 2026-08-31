export function hybridClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const sc = (globalThis as unknown as { structuredClone?: <U>(v: U) => U }).structuredClone;
  if (typeof sc === "function") {
    try {
      return sc(value);
    } catch {
      // fallback below
    }
  }
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (value instanceof Map) {
    const m = new Map();
    for (const [k, v] of value) m.set(hybridClone(k), hybridClone(v));
    return m as unknown as T;
  }
  if (value instanceof Set) {
    const s = new Set();
    for (const v of value) s.add(hybridClone(v));
    return s as unknown as T;
  }
  if (Array.isArray(value)) return (value as unknown[]).map(hybridClone) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const k of Object.keys(value as object)) result[k] = hybridClone((value as Record<string, unknown>)[k] as T);
  return result as unknown as T;
}
