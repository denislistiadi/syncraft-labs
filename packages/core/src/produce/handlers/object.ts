import { assertNoCycles, validateStateShape } from "../../guards/index.js";
import type { Path } from "../types.js";
import type { DraftContext } from "../context.js";
import { markChanged } from "../context.js";
import { isSupportedObject } from "../utils.js";
import { getMapDraft, getSetDraft } from "./collection.js";

export function getDraft(
  target: any,
  path: Path,
  ancestors: Set<object>,
  ctx: DraftContext,
): any {
  if (target instanceof Map) return getMapDraft(target, path, ancestors, ctx, (t, p, a) => getDraft(t, p, a, ctx));
  if (target instanceof Set) return getSetDraft(target, path, ancestors, ctx, (t, p, a) => getDraft(t, p, a, ctx));
  if (!isSupportedObject(target)) return target;
  if (ctx.proxies.has(target)) return ctx.proxies.get(target);
  if (ancestors.has(target)) {
    const pathStr = path.length > 0 ? path.join(".") : "<root>";
    throw new Error(`[Syncraft Labs] Circular reference detected at path "${pathStr}". State must be a plain acyclic object tree.`);
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(target);

  const handler: ProxyHandler<any> = {
    get(_dummy, prop) {
      if (prop === "__isProxy") return true;
      if (prop === "__target") return target;
      if (prop === "__proto__" || prop === "constructor" || prop === "prototype") return undefined;
      if (typeof prop === "symbol") {
        const source = ctx.copies.get(target) ?? target;
        return Reflect.get(source, prop);
      }
      const source = ctx.copies.get(target) ?? target;
      const value = source[prop];
      if (typeof value === "function") {
        return function (...args: any[]) {
          return value.apply(ctx.proxies.get(target), args);
        };
      }
      if (isSupportedObject(value)) {
        ctx.parents.set(value, { parent: target, prop: prop as string | number });
        return getDraft(value, [...path, prop as string | number], nextAncestors, ctx);
      }
      return value;
    },
    set(_dummy, prop, value) {
      if (typeof prop === "symbol") {
        markChanged(ctx, target);
        const copy = ctx.copies.get(target);
        return Reflect.set(copy, prop, value);
      }
      if (prop === "__proto__" || prop === "constructor" || prop === "prototype") return false;
      const isArr = Array.isArray(target);
      const propKey = isArr && typeof prop === "string" && /^\d+$/.test(prop) ? Number(prop) : prop;
      if (isArr && propKey === "length") {
        const source = ctx.copies.get(target) ?? target;
        const oldLength = source.length;
        const newLength = value as number;
        if (oldLength !== newLength) {
          markChanged(ctx, target);
          const copy = ctx.copies.get(target);
          if (newLength < oldLength) {
            for (let i = oldLength - 1; i >= newLength; i--) {
              if (i in copy) {
                const oldValue = copy[i];
                delete copy[i];
                ctx.patches.push({ op: "remove", path: [...path, i] });
                ctx.inversePatches.push({ op: "add", path: [...path, i], value: oldValue });
              }
            }
          }
          copy.length = newLength;
          ctx.isDirty.value = true;
        }
        return true;
      }
      const source = ctx.copies.get(target) ?? target;
      const hasKey = isArr ? Number(propKey) < source.length || propKey in source : propKey in source;
      const oldValue = source[propKey];
      if (hasKey && oldValue === value) return true;
      markChanged(ctx, target);
      const copy = ctx.copies.get(target);
      let actualValue = value;
      if (value && typeof value === "object" && (value as Record<string, unknown>).__isProxy) {
        actualValue = ctx.copies.get((value as Record<string, unknown>).__target as object) ?? (value as Record<string, unknown>).__target;
      }
      const fullPath = [...path, propKey as string | number];
      if (actualValue !== null && typeof actualValue === "object") {
        const raw =
          typeof (actualValue as Record<string, unknown>).__target === "object" &&
          (actualValue as Record<string, unknown>).__target !== null
            ? ((actualValue as Record<string, unknown>).__target as object)
            : (actualValue as object);
        if (nextAncestors.has(raw as object)) {
          throw new Error(`[Syncraft Labs] Circular reference detected at path "${fullPath.join(".")}". State must be a plain acyclic object tree.`);
        }
        assertNoCycles(actualValue, undefined, fullPath);
        if (ctx.devMode) validateStateShape(actualValue, "draft mutation", fullPath);
      } else if (typeof actualValue === "function" && ctx.devMode) {
        validateStateShape(actualValue, "draft mutation", fullPath);
      }
      copy[propKey] = actualValue;
      ctx.isDirty.value = true;
      if (hasKey) {
        ctx.patches.push({ op: "replace", path: fullPath, value: actualValue });
        ctx.inversePatches.push({ op: "replace", path: fullPath, value: oldValue });
      } else {
        ctx.patches.push({ op: "add", path: fullPath, value: actualValue });
        ctx.inversePatches.push({ op: "remove", path: fullPath });
      }
      return true;
    },
    deleteProperty(_dummy, prop) {
      if (typeof prop === "symbol") {
        markChanged(ctx, target);
        const copy = ctx.copies.get(target);
        return Reflect.deleteProperty(copy, prop);
      }
      if (prop === "__proto__" || prop === "constructor" || prop === "prototype") return false;
      const isArr = Array.isArray(target);
      const propKey = isArr && typeof prop === "string" && /^\d+$/.test(prop) ? Number(prop) : prop;
      const source = ctx.copies.get(target) ?? target;
      if (!(propKey in source)) return true;
      const oldValue = source[propKey];
      markChanged(ctx, target);
      const copy = ctx.copies.get(target);
      delete copy[propKey];
      ctx.isDirty.value = true;
      const fullPath = [...path, propKey as string | number];
      ctx.patches.push({ op: "remove", path: fullPath });
      ctx.inversePatches.push({ op: "add", path: fullPath, value: oldValue });
      return true;
    },
    has(_dummy, prop) {
      if (prop === "__isProxy" || prop === "__target") return true;
      const source = ctx.copies.get(target) ?? target;
      return prop in source;
    },
    ownKeys(_dummy) {
      const source = ctx.copies.get(target) ?? target;
      return Reflect.ownKeys(source);
    },
    getOwnPropertyDescriptor(_dummy, prop) {
      const source = ctx.copies.get(target) ?? target;
      const desc = Reflect.getOwnPropertyDescriptor(source, prop);
      if (!desc) return undefined;
      return { ...desc, configurable: true, writable: true };
    },
  };
  const proxyTarget = Array.isArray(target) ? [] : {};
  const proxy = new Proxy(proxyTarget, handler);
  ctx.proxies.set(target, proxy);
  return proxy;
}
