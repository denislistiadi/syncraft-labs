import type { Path } from "./types.js";

export function isSupportedObject(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (value instanceof Map || value instanceof Set) return true;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function assertStringKey(key: unknown, path: Path): string {
  if (typeof key !== "string" && typeof key !== "number") {
    const pathStr = path.length > 0 ? path.join(".") : "<root>";
    throw new Error(
      `[Syncraft Labs] Map/Set key must be string or number, got "${typeof key}" at path "${pathStr}". ` +
        `Use string keys for Map and string values for Set.`,
    );
  }
  return String(key);
}
