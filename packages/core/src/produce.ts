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

  function getDraft(target: any, path: Path): any {
    if (!isPlainObject(target)) return target;
    if (proxies.has(target)) return proxies.get(target);

    const handler: ProxyHandler<any> = {
      get(obj, prop) {
        if (prop === "__isProxy") return true;
        if (prop === "__target") return obj;
        if (prop === "__proto__" || prop === "constructor" || prop === "prototype") {
          return undefined;
        }

        if (typeof prop === "symbol") {
          return Reflect.get(obj, prop);
        }

        const source = copies.get(obj) ?? obj;
        const value = source[prop];

        if (typeof value === "function") {
          return function (...args: any[]) {
            return value.apply(proxies.get(obj), args);
          };
        }

        if (isPlainObject(value)) {
          parents.set(value, { parent: obj, prop: prop as string | number });
          return getDraft(value, [...path, prop as string | number]);
        }

        return value;
      },
      set(obj, prop, value) {
        if (typeof prop === "symbol") {
          const copy = copies.get(obj) ?? { ...obj };
          copies.set(obj, copy);
          return Reflect.set(copy, prop, value);
        }

        if (prop === "__proto__" || prop === "constructor" || prop === "prototype") {
          return false; // Prevent prototype pollution
        }
        const isArr = Array.isArray(obj);
        const propKey =
          isArr && typeof prop === "string" && /^\d+$/.test(prop)
            ? Number(prop)
            : prop;

        if (isArr && propKey === "length") {
          const source = copies.get(obj) ?? obj;
          const oldLength = source.length;
          const newLength = value as number;

          if (oldLength !== newLength) {
            markChanged(obj);
            const copy = copies.get(obj);
            
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

        const source = copies.get(obj) ?? obj;
        const hasKey = isArr
          ? Number(propKey) < source.length || propKey in source
          : propKey in source;
        const oldValue = source[propKey];

        if (hasKey && oldValue === value) return true;

        markChanged(obj);
        const copy = copies.get(obj);
        
        let actualValue = value;
        if (value && typeof value === "object" && value.__isProxy) {
          actualValue = copies.get(value.__target) ?? value.__target;
        }

        copy[propKey] = actualValue;
        isDirty = true;

        const fullPath = [...path, propKey as string | number];
        if (hasKey) {
          patches.push({ op: "replace", path: fullPath, value: actualValue });
          inversePatches.push({ op: "replace", path: fullPath, value: oldValue });
        } else {
          patches.push({ op: "add", path: fullPath, value: actualValue });
          inversePatches.push({ op: "remove", path: fullPath });
        }

        return true;
      },
      deleteProperty(obj, prop) {
        if (typeof prop === "symbol") {
          const copy = copies.get(obj) ?? { ...obj };
          copies.set(obj, copy);
          return Reflect.deleteProperty(copy, prop);
        }

        if (prop === "__proto__" || prop === "constructor" || prop === "prototype") {
          return false;
        }
        const isArr = Array.isArray(obj);
        const propKey =
          isArr && typeof prop === "string" && /^\d+$/.test(prop)
            ? Number(prop)
            : prop;

        const source = copies.get(obj) ?? obj;
        if (!(propKey in source)) return true;

        const oldValue = source[propKey];

        markChanged(obj);
        const copy = copies.get(obj);

        delete copy[propKey];
        isDirty = true;

        const fullPath = [...path, propKey as string | number];
        patches.push({ op: "remove", path: fullPath });
        inversePatches.push({ op: "add", path: fullPath, value: oldValue });

        return true;
      },
    };

    const proxy = new Proxy(target, handler);
    Object.defineProperty(proxy, "__target", { value: target, enumerable: false });
    
    proxies.set(target, proxy);
    return proxy;
  }

  const draft = getDraft(baseState, []);
  const result = updater(draft);

  const nextState =
    result !== undefined ? result : copies.get(baseState) ?? baseState;

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
