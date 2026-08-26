import { assertNoCycles, isDevMode, validateStateShape } from "./guards.js";

export type Path = (string | number)[];

export interface Patch {
  op: "replace" | "add" | "remove";
  path: Path;
  value?: unknown;
}

function isPlainObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null || Array.isArray(value);
}

export function produceWithPatches<T>(
  baseState: T,
  updater: (draft: T) => void | T
): [T, Patch[], Patch[]] {
  if (baseState !== null && typeof baseState === "object") {
    assertNoCycles(baseState);
  }

  const devMode = isDevMode();
  const patches: Patch[] = [];
  const inversePatches: Patch[] = [];
  let isDirty = false;

  const copies = new Map<any, any>();
  const proxies = new Map<any, any>();
  const parents = new Map<any, { parent: any; prop: string | number }>();

  function markChanged(target: any) {
    if (!copies.has(target)) {
      const copy = Array.isArray(target) ? [...target] : { ...target };
      copies.set(target, copy);

      const parentInfo = parents.get(target);
      if (parentInfo) {
        markChanged(parentInfo.parent);
        const parentCopy = copies.get(parentInfo.parent);
        parentCopy[parentInfo.prop] = copy;
      }
    }
  }

  function getDraft(
    target: any,
    path: Path,
    ancestors: Set<object> = new Set()
  ): any {
    if (!isPlainObject(target)) return target;
    if (proxies.has(target)) return proxies.get(target);

    if (ancestors.has(target)) {
      const pathStr = path.length > 0 ? path.join(".") : "<root>";
      throw new Error(
        `[Syncraft Labs] Circular reference detected at path "${pathStr}". ` +
          `State must be a plain acyclic object tree.`
      );
    }

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(target);

    const handler: ProxyHandler<any> = {
      get(_dummy, prop) {
        if (prop === "__isProxy") return true;
        if (prop === "__target") return target;
        if (prop === "__proto__" || prop === "constructor" || prop === "prototype") {
          return undefined;
        }

        if (typeof prop === "symbol") {
          const source = copies.get(target) ?? target;
          return Reflect.get(source, prop);
        }

        const source = copies.get(target) ?? target;
        const value = source[prop];

        if (typeof value === "function") {
          return function (...args: any[]) {
            return value.apply(proxies.get(target), args);
          };
        }

        if (isPlainObject(value)) {
          parents.set(value, { parent: target, prop: prop as string | number });
          return getDraft(
            value,
            [...path, prop as string | number],
            nextAncestors
          );
        }

        return value;
      },
      set(_dummy, prop, value) {
        if (typeof prop === "symbol") {
          const copy =
            copies.get(target) ??
            (Array.isArray(target) ? [...target] : { ...target });
          copies.set(target, copy);
          return Reflect.set(copy, prop, value);
        }

        if (prop === "__proto__" || prop === "constructor" || prop === "prototype") {
          return false; // Prevent prototype pollution
        }
        const isArr = Array.isArray(target);
        const propKey =
          isArr && typeof prop === "string" && /^\d+$/.test(prop)
            ? Number(prop)
            : prop;

        if (isArr && propKey === "length") {
          const source = copies.get(target) ?? target;
          const oldLength = source.length;
          const newLength = value as number;

          if (oldLength !== newLength) {
            markChanged(target);
            const copy = copies.get(target);
            
            if (newLength < oldLength) {
              for (let i = oldLength - 1; i >= newLength; i--) {
                if (i in copy) {
                  const oldValue = copy[i];
                  delete copy[i];
                  patches.push({ op: "remove", path: [...path, i] });
                  inversePatches.push({
                    op: "add",
                    path: [...path, i],
                    value: oldValue,
                  });
                }
              }
            }
            copy.length = newLength;
            isDirty = true;
          }
          return true;
        }

        const source = copies.get(target) ?? target;
        const hasKey = isArr
          ? Number(propKey) < source.length || propKey in source
          : propKey in source;
        const oldValue = source[propKey];

        if (hasKey && oldValue === value) return true;

        markChanged(target);
        const copy = copies.get(target);
        
        let actualValue = value;
        if (value && typeof value === "object" && value.__isProxy) {
          actualValue = copies.get(value.__target) ?? value.__target;
        }

        const fullPath = [...path, propKey as string | number];

        if (actualValue !== null && typeof actualValue === "object") {
          const raw =
            typeof (actualValue as any).__target === "object" &&
            (actualValue as any).__target !== null
              ? (actualValue as any).__target
              : actualValue;
          if (nextAncestors.has(raw)) {
            throw new Error(
              `[Syncraft Labs] Circular reference detected at path "${fullPath.join(".")}". ` +
                `State must be a plain acyclic object tree.`,
            );
          }
          assertNoCycles(
            actualValue,
            undefined,
            fullPath,
          );
          if (devMode) {
            validateStateShape(actualValue, "draft mutation", fullPath);
          }
        } else if (typeof actualValue === "function") {
          if (devMode) {
            validateStateShape(actualValue, "draft mutation", fullPath);
          }
        }

        copy[propKey] = actualValue;
        isDirty = true;

        if (hasKey) {
          patches.push({ op: "replace", path: fullPath, value: actualValue });
          inversePatches.push({ op: "replace", path: fullPath, value: oldValue });
        } else {
          patches.push({ op: "add", path: fullPath, value: actualValue });
          inversePatches.push({ op: "remove", path: fullPath });
        }

        return true;
      },
      deleteProperty(_dummy, prop) {
        if (typeof prop === "symbol") {
          const copy =
            copies.get(target) ??
            (Array.isArray(target) ? [...target] : { ...target });
          copies.set(target, copy);
          return Reflect.deleteProperty(copy, prop);
        }

        if (prop === "__proto__" || prop === "constructor" || prop === "prototype") {
          return false;
        }
        const isArr = Array.isArray(target);
        const propKey =
          isArr && typeof prop === "string" && /^\d+$/.test(prop)
            ? Number(prop)
            : prop;

        const source = copies.get(target) ?? target;
        if (!(propKey in source)) return true;

        const oldValue = source[propKey];

        markChanged(target);
        const copy = copies.get(target);

        delete copy[propKey];
        isDirty = true;

        const fullPath = [...path, propKey as string | number];
        patches.push({ op: "remove", path: fullPath });
        inversePatches.push({ op: "add", path: fullPath, value: oldValue });

        return true;
      },
      has(_dummy, prop) {
        if (prop === "__isProxy" || prop === "__target") return true;
        const source = copies.get(target) ?? target;
        return prop in source;
      },
      ownKeys(_dummy) {
        const source = copies.get(target) ?? target;
        return Reflect.ownKeys(source);
      },
      getOwnPropertyDescriptor(_dummy, prop) {
        const source = copies.get(target) ?? target;
        const desc = Reflect.getOwnPropertyDescriptor(source, prop);
        if (!desc) return undefined;
        return {
          ...desc,
          configurable: true,
          writable: true,
        };
      },
    };

    const proxyTarget = Array.isArray(target) ? [] : {};
    const proxy = new Proxy(proxyTarget, handler);
    proxies.set(target, proxy);
    return proxy;
  }

  const draft = getDraft(baseState, []);
  const result = updater(draft);

  const nextState =
    result !== undefined ? result : copies.get(baseState) ?? baseState;

  if (nextState !== null && typeof nextState === "object") {
    assertNoCycles(nextState);
    if (devMode) {
      validateStateShape(nextState, "produce nextState");
    }
  }

  if (!isDirty && result === undefined) {
    return [baseState, [], []];
  }

  if (result !== undefined && result !== baseState) {
    return [
      nextState as T,
      [{ op: "replace", path: [], value: nextState }],
      [{ op: "replace", path: [], value: baseState }],
    ];
  }

  return [nextState as T, patches, inversePatches];
}

/**
 * Apply a series of Immer-style JSON patches to a base state object.
 * Returns a new state object with the patches applied (does not mutate baseState).
 *
 * @template T - The shape of the state.
 * @param baseState - The original state to apply patches onto.
 * @param patches - Array of patches to apply sequentially.
 * @returns A new state object representing the state after all patches are applied.
 */
export function applyPatches<T>(baseState: T, patches: readonly Patch[]): T {
  if (patches.length === 0) {
    return baseState;
  }

  // Deep clone baseState to avoid mutating the original
  let state: any = structuredClone(baseState);

  for (const patch of patches) {
    const { op, path, value } = patch;

    if (path.length === 0) {
      if (op === "replace") {
        state = structuredClone(value);
      }
      continue;
    }

    let target = state;
    for (let i = 0; i < path.length - 1; i++) {
      target = target[path[i]!];
    }
    const lastKey = path[path.length - 1]!;

    switch (op) {
      case "replace":
        target[lastKey] = structuredClone(value);
        break;
      case "add":
        if (Array.isArray(target)) {
          target.splice(Number(lastKey), 0, structuredClone(value));
        } else {
          target[lastKey] = structuredClone(value);
        }
        break;
      case "remove":
        if (Array.isArray(target)) {
          target.splice(Number(lastKey), 1);
        } else {
          delete target[lastKey];
        }
        break;
    }
  }

  return state as T;
}

