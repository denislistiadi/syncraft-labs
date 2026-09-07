import type { Path } from "../types.js";
import type { DraftContext } from "../context.js";
import { markChanged } from "../context.js";
import { assertStringKey, isSupportedObject } from "../utils.js";
import { validateValue } from "./shared.js";

export function getMapDraft(
  target: Map<any, any>,
  path: Path,
  ancestors: Set<object>,
  ctx: DraftContext,
  getDraft: (t: any, p: Path, a: Set<object>) => any,
): any {
  if (ctx.proxies.has(target)) return ctx.proxies.get(target);
  if (ancestors.has(target)) {
    throw new Error(`[Syncraft Labs] Circular reference detected at path "${path.join(".")}". State must be a plain acyclic object tree.`);
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(target);

  const handler: ProxyHandler<Map<any, any>> = {
    get(_dummy, prop) {
      if (prop === "__isProxy") return true;
      if (prop === "__target") return target;
      if (prop === Symbol.iterator) {
        const source = ctx.copies.get(target) ?? target;
        return () => source[Symbol.iterator]();
      }
      const source = ctx.copies.get(target) ?? target;
      switch (prop) {
        case "set": {
          return (key: any, value: any) => {
            const keyStr = assertStringKey(key, path);
            const hadKey = source.has(key);
            const oldValue = hadKey ? source.get(key) : undefined;
            if (hadKey && oldValue === value) return ctx.proxies.get(target) ?? target;
            validateValue(ctx, value, [...path, "$entries", keyStr]);
            markChanged(ctx, target);
            const copy = ctx.copies.get(target);
            copy.set(key, value);
            ctx.isDirty.value = true;
            if (hadKey) {
              ctx.patches.push({ op: "replace", path: [...path, "$entries", keyStr], value });
              ctx.inversePatches.push({ op: "replace", path: [...path, "$entries", keyStr], value: oldValue });
            } else {
              ctx.patches.push({ op: "add", path: [...path, "$entries", keyStr], value });
              ctx.inversePatches.push({ op: "remove", path: [...path, "$entries", keyStr] });
            }
            return ctx.proxies.get(target) ?? target;
          };
        }
        case "delete": {
          return (key: any) => {
            if (!source.has(key)) return false;
            const keyStr = assertStringKey(key, path);
            markChanged(ctx, target);
            const copy = ctx.copies.get(target);
            const oldValue = source.get(key);
            copy.delete(key);
            ctx.isDirty.value = true;
            ctx.patches.push({ op: "remove", path: [...path, "$entries", keyStr] });
            ctx.inversePatches.push({ op: "add", path: [...path, "$entries", keyStr], value: oldValue });
            return true;
          };
        }
        case "clear": {
          return () => {
            if (source.size === 0) return;
            markChanged(ctx, target);
            const copy = ctx.copies.get(target);
            for (const [k, v] of source.entries()) {
              const keyStr = assertStringKey(k, path);
              ctx.patches.push({ op: "remove", path: [...path, "$entries", keyStr] });
              ctx.inversePatches.push({ op: "add", path: [...path, "$entries", keyStr], value: v });
            }
            copy.clear();
            ctx.isDirty.value = true;
          };
        }
        case "get": {
          return (key: any) => {
            const val = source.get(key);
            if (isSupportedObject(val)) {
              ctx.parents.set(val, { parent: target, prop: key });
              return getDraft(val, [...path, "$entries", String(key)], nextAncestors);
            }
            return val;
          };
        }
        case "has":
          return (key: any) => source.has(key);
        case "size":
          return source.size;
        case "entries":
          return () => source.entries();
        case "keys":
          return () => source.keys();
        case "values":
          return () => source.values();
        case "forEach":
          return (cb: Function, thisArg?: any) => source.forEach(cb, thisArg);
        default: {
          const val = (source as Record<string | symbol, unknown>)[prop as string];
          if (typeof val === "function") return (val as Function).bind(source);
          return val;
        }
      }
    },
    set(_dummy, prop, _value) {
      if (prop === "__isProxy" || prop === "__target") return true;
      throw new Error(`[Syncraft Labs] Direct property assignment on Map is not supported. Use map.set() instead.`);
    },
  };
  const proxy = new Proxy(target, handler);
  ctx.proxies.set(target, proxy);
  return proxy;
}
