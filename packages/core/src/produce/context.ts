import type { Patch } from "./types.js";

export interface DraftContext {
  copies: Map<any, any>;
  proxies: Map<any, any>;
  parents: Map<object, { parent: any; prop: string | number }>;
  patches: Patch[];
  inversePatches: Patch[];
  isDirty: { value: boolean };
  devMode: boolean;
}

export function createDraftContext(devMode: boolean): DraftContext {
  return {
    copies: new Map(),
    proxies: new Map(),
    parents: new Map(),
    patches: [],
    inversePatches: [],
    isDirty: { value: false },
    devMode,
  };
}

function shallowCopy(target: any): any {
  if (target instanceof Map) return new Map(target);
  if (target instanceof Set) return new Set(target);
  if (Array.isArray(target)) return [...target];
  return { ...target };
}

export function markChanged(ctx: DraftContext, target: any): void {
  if (ctx.copies.has(target)) return;
  const copy = shallowCopy(target);
  ctx.copies.set(target, copy);
  const parentInfo = ctx.parents.get(target);
  if (parentInfo) {
    markChanged(ctx, parentInfo.parent);
    const parentCopy = ctx.copies.get(parentInfo.parent);
    if (parentInfo.parent instanceof Map) {
      parentCopy.set(parentInfo.prop, copy);
    } else if (parentInfo.parent instanceof Set) {
      parentCopy.delete(parentInfo.prop);
      parentCopy.add(copy);
    } else {
      parentCopy[parentInfo.prop] = copy;
    }
  }
}
