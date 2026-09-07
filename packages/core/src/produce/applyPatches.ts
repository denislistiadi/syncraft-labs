import { hybridClone } from "./clone.js";
import type { Patch } from "./types.js";

export function applyPatches<T>(baseState: T, patches: readonly Patch[]): T {
  if (patches.length === 0) return baseState;
  let state: any = hybridClone(baseState);
  for (const patch of patches) {
    const { op, path, value } = patch;
    if (path.length === 0) {
      if (op === "replace") state = hybridClone(value);
      continue;
    }
    let target = state;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i]!;
      if (seg === "$entries" && target instanceof Map) {
        const key = path[i + 1]!;
        if (i + 1 < path.length - 1) {
          target = target.get(key);
          i++;
        }
        continue;
      }
      if (seg === "$values" && target instanceof Set) continue;
      target = target[seg];
    }
    const lastKey = path[path.length - 1]!;
    if (target instanceof Map) {
      switch (op) {
        case "replace":
        case "add":
          target.set(lastKey, hybridClone(value));
          break;
        case "remove":
          target.delete(lastKey);
          break;
      }
    } else if (target instanceof Set) {
      switch (op) {
        case "replace":
        case "add":
          target.add(hybridClone(value));
          break;
        case "remove":
          target.delete(lastKey);
          break;
      }
    } else {
      switch (op) {
        case "replace":
          target[lastKey] = hybridClone(value);
          break;
        case "add":
          if (Array.isArray(target)) target.splice(Number(lastKey), 0, hybridClone(value));
          else target[lastKey] = hybridClone(value);
          break;
        case "remove":
          if (Array.isArray(target)) target.splice(Number(lastKey), 1);
          else delete target[lastKey];
          break;
      }
    }
  }
  return state as T;
}
