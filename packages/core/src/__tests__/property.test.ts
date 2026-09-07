import { describe, expect, it } from "vitest";
import { produceWithPatches, applyPatches } from "../produce.js";

function mutatePath(
  obj: Record<string, unknown>,
  path: (string | number)[],
  value: unknown
): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const last = path[path.length - 1]!;
  (current as Record<string | number, unknown>)[last] = value;
}

describe("general property-based tests (plain objects)", () => {
  it("applyPatches(base, patches) equals nextState for nested object mutation", () => {
    for (let i = 0; i < 200; i++) {
      const depth = Math.floor(Math.random() * 2);
      const newValue = Math.floor(Math.random() * 10000);
      const base: Record<string, unknown> = { value: depth, nested: { deep: depth } };
      const path: (string | number)[] = ["nested", "deep"];
      const [next, patches, inversePatches] = produceWithPatches(base, (d) => {
        mutatePath(d, path, newValue);
      });
      expect(applyPatches(base, patches)).toEqual(next);
      expect(applyPatches(next, inversePatches.reverse())).toEqual(base);
    }
  });

  it("applyPatches(base, patches) equals nextState for array index mutation", () => {
    for (let i = 0; i < 200; i++) {
      const depth = Math.floor(Math.random() * 2);
      const idx = Math.floor(Math.random() * 5);
      const newValue = Math.floor(Math.random() * 10000);
      const base: Record<string, unknown> = { arr: [depth, depth + 1, depth + 2, depth + 3, depth + 4] };
      const path: (string | number)[] = ["arr", idx];
      const [next, patches, inversePatches] = produceWithPatches(base, (d) => {
        mutatePath(d, path, newValue);
      });
      expect(applyPatches(base, patches)).toEqual(next);
      expect(applyPatches(next, inversePatches.reverse())).toEqual(base);
    }
  });

  it("multiple sequential mutations are reversible", () => {
    for (let i = 0; i < 200; i++) {
      const depth = Math.floor(Math.random() * 2);
      const count = 1 + Math.floor(Math.random() * 5);
      const seed = Math.floor(Math.random() * 10000);
      const base: Record<string, unknown> = { value: depth, nested: { deep: depth } };
      const mutations = Array.from({ length: count }, (_, j) => ({
        path: ["nested", "deep"] as (string | number)[],
        value: seed + 10000 + j,
      }));
      const [next, patches, inversePatches] = produceWithPatches(base, (d) => {
        for (const m of mutations) {
          mutatePath(d, m.path, m.value);
        }
      });
      expect(applyPatches(base, patches)).toEqual(next);
      expect(applyPatches(next, inversePatches.reverse())).toEqual(base);
    }
  });

  it("patch count matches mutation count", () => {
    for (let i = 0; i < 200; i++) {
      const depth = Math.floor(Math.random() * 2);
      const count = 1 + Math.floor(Math.random() * 5);
      const base: Record<string, unknown> = { value: depth };
      const mutations = Array.from({ length: count }, (_, j) => ({
        path: ["value"] as (string | number)[],
        value: 10000 + j,
      }));
      const [, patches] = produceWithPatches(base, (d) => {
        for (const m of mutations) {
          mutatePath(d, m.path, m.value);
        }
      });
      expect(patches.length).toBe(count);
    }
  });

  it("random array inside object is reversible", () => {
    for (let i = 0; i < 200; i++) {
      const depth = Math.floor(Math.random() * 2);
      const seed = Math.floor(Math.random() * 10000);
      const arr = Array.from({ length: depth + 1 }, (_, j) => seed + j);
      const base: Record<string, unknown> = { arr };
      const [next, patches, inversePatches] = produceWithPatches(base, (d) => {
        (d.arr as unknown[])[0] = depth * 100;
      });
      expect(applyPatches(base, patches)).toEqual(next);
      expect(applyPatches(next, inversePatches)).toEqual(base);
    }
  });
});
