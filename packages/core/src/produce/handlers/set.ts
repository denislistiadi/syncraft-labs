import type { Path } from "../types.js";
import type { DraftContext } from "../context.js";
import { markChanged } from "../context.js";
import { assertStringKey } from "../utils.js";
import { validateValue } from "./shared.js";

export function getSetDraft(
  target: Set<any>,
  path: Path,
  ancestors: Set<object>,
  ctx: DraftContext,
  _getDraft: (t: any, p: Path, a: Set<object>) => any,
): any {
  if (ctx.proxies.has(target)) return ctx.proxies.get(target);
  if (ancestors.has(target)) {
    throw new Error(`[Syncraft Labs] Circular reference detected at path "${path.join(".")}". State must be a plain acyclic object tree.`);
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(target);

  const handler: ProxyHandler<Set<any>> = {
    get(_dummy, prop) {
      if (prop === "__isProxy") return true;
      if (prop === "__target") return target;
      if (prop === Symbol.iterator) {
        const source = ctx.copies.get(target) ?? target;
        return () => source[Symbol.iterator]();
      }
      const source = ctx.copies.get(target) ?? target;
      switch (prop) {
        case "add": {
          return (value: any) => {
            const hadValue = source.has(value);
            if (hadValue) return ctx.proxies.get(target) ?? target;
            const valStr = assertStringKey(value, path);
            validateValue(ctx, value, [...path, "$values", valStr]);
            markChanged(ctx, target);
            const copy = ctx.copies.get(target);
            copy.add(value);
            ctx.isDirty.value = true;
            ctx.patches.push({ op: "add", path: [...path, "$values", valStr], value });
            ctx.inversePatches.push({ op: "remove", path: [...path, "$values", valStr] });
            return ctx.proxies.get(target) ?? target;
          };
        }
        case "delete": {
          return (value: any) => {
            if (!source.has(value)) return false;
            const valStr = assertStringKey(value, path);
            markChanged(ctx, target);
            const copy = ctx.copies.get(target);
            copy.delete(value);
            ctx.isDirty.value = true;
            ctx.patches.push({ op: "remove", path: [...path, "$values", valStr] });
            ctx.inversePatches.push({ op: "add", path: [...path, "$values", valStr], value });
            return true;
          };
        }
        case "clear": {
          return () => {
            if (source.size === 0) return;
            markChanged(ctx, target);
            const copy = ctx.copies.get(target);
            for (const v of source) {
              const valStr = assertStringKey(v, path);
              ctx.patches.push({ op: "remove", path: [...path, "$values", valStr] });
              ctx.inversePatches.push({ op: "add", path: [...path, "$values", valStr], value: v });
            }
            copy.clear();
            ctx.isDirty.value = true;
          };
        }
        case "has":
          return (value: any) => source.has(value);
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
      throw new Error(`[Syncraft Labs] Direct property assignment on Set is not supported. Use set.add() instead.`);
    },
  };
  const proxy = new Proxy(target, handler);
  ctx.proxies.set(target, proxy);
  return proxy;
}
