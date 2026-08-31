export function deepFreeze<T>(obj: T, seen = new WeakSet<object>()): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (seen.has(obj as object)) return obj;
  seen.add(obj as object);
  Object.freeze(obj);
  if (obj instanceof Map) {
    for (const [key, value] of obj) {
      if (key !== null && typeof key === "object") deepFreeze(key, seen);
      deepFreeze(value, seen);
    }
    return obj;
  }
  if (obj instanceof Set) {
    for (const value of obj) {
      if (value !== null && typeof value === "object") deepFreeze(value, seen);
    }
    return obj;
  }
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && "value" in desc && desc.value !== null && typeof desc.value === "object") {
      deepFreeze(desc.value, seen);
    }
  }
  return obj;
}
