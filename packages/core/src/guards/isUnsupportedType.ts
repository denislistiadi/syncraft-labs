export function isUnsupportedType(value: unknown): boolean {
  if (value === null || typeof value !== "object") return typeof value === "function";
  if (value instanceof Date || Object.prototype.toString.call(value) === "[object Date]") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Map || value instanceof Set) return false;
  const proto = Object.getPrototypeOf(value);
  return proto !== Object.prototype && proto !== null;
}
