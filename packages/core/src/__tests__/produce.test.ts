import { describe, expect, it } from "vitest";
import { produceWithPatches, applyPatches } from "../produce.js";

describe("produceWithPatches", () => {
  it("should handle top-level property assignment", () => {
    const base = { a: 1 };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.a = 2;
    });
    expect(next).toEqual({ a: 2 });
    expect(patches).toEqual([{ op: "replace", path: ["a"], value: 2 }]);
    expect(inverse).toEqual([{ op: "replace", path: ["a"], value: 1 }]);
  });

  it("should handle nested property assignment", () => {
    const base = { a: { b: { c: 1 } } };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.a.b.c = 2;
    });
    expect(next).toEqual({ a: { b: { c: 2 } } });
    expect(next.a).not.toBe(base.a);
    expect(next.a.b).not.toBe(base.a.b);
    expect(patches).toEqual([{ op: "replace", path: ["a", "b", "c"], value: 2 }]);
  });

  it("should handle property deletion", () => {
    const base: { a?: number; b: number } = { a: 1, b: 2 };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      delete d.a;
    });
    expect(next).toEqual({ b: 2 });
    expect(patches).toEqual([{ op: "remove", path: ["a"] }]);
    expect(inverse).toEqual([{ op: "add", path: ["a"], value: 1 }]);
  });

  it("should handle array.push", () => {
    const base = { arr: [1, 2] };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.arr.push(3);
    });
    expect(next).toEqual({ arr: [1, 2, 3] });
    expect(patches).toEqual([{ op: "add", path: ["arr", 2], value: 3 }]);
    expect(inverse).toEqual([{ op: "remove", path: ["arr", 2] }]);
  });

  it("should handle array.pop", () => {
    const base = { arr: [1, 2, 3] };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.arr.pop();
    });
    expect(next).toEqual({ arr: [1, 2] });
    expect(patches).toEqual([{ op: "remove", path: ["arr", 2] }]);
    expect(inverse).toEqual([{ op: "add", path: ["arr", 2], value: 3 }]);
  });

  it("should handle array.splice (remove)", () => {
    const base = { arr: [1, 2, 3] };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.arr.splice(1, 1);
    });
    expect(next).toEqual({ arr: [1, 3] });
    // splice shifts element 2 to index 1, then removes index 2
    expect(patches).toEqual([
      { op: "replace", path: ["arr", 1], value: 3 },
      { op: "remove", path: ["arr", 2] },
    ]);
  });

  it("should handle array.splice (insert)", () => {
    const base = { arr: [1, 2] };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.arr.splice(1, 0, 1.5);
    });
    expect(next).toEqual({ arr: [1, 1.5, 2] });
    expect(patches).toEqual([
      { op: "add", path: ["arr", 2], value: 2 },
      { op: "replace", path: ["arr", 1], value: 1.5 },
    ]);
  });

  it("should handle array.length truncation", () => {
    const base = { arr: [1, 2, 3] };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.arr.length = 1;
    });
    expect(next).toEqual({ arr: [1] });
    expect(patches).toEqual([
      { op: "remove", path: ["arr", 2] },
      { op: "remove", path: ["arr", 1] },
    ]);
  });

  it("should handle no-op correctly (dirty flag)", () => {
    const base = { a: 1 };
    const [next, patches, inverse] = produceWithPatches(base, (_d) => {
      // no op
    });
    expect(next).toBe(base); // Same reference
    expect(patches.length).toBe(0);
    expect(inverse.length).toBe(0);
  });

  it("should passthrough Date objects without proxying", () => {
    const date = new Date("2026-01-01");
    const base = { a: date, b: 2 };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.b = 3;
    });
    expect(next.a).toBe(date); // Reference must be preserved
    expect(patches).toEqual([{ op: "replace", path: ["b"], value: 3 }]);
  });

  it("should support replacing state by returning a new value", () => {
    const base = { a: 1 };
    const [next, patches, inverse] = produceWithPatches(base, (_d) => {
      return { a: 2, b: 3 } as any;
    });
    expect(next).toEqual({ a: 2, b: 3 });
    expect(patches).toEqual([{ op: "replace", path: [], value: { a: 2, b: 3 } }]);
    expect(inverse).toEqual([{ op: "replace", path: [], value: { a: 1 } }]);
  });

  it("should prevent prototype pollution", () => {
    const base = { a: 1 };
    expect(() => {
      produceWithPatches(base, (d: any) => {
        d.__proto__.polluted = true;
      });
    }).toThrow();
  });

  it("should handle assigning draft properties to another property correctly", () => {
    const base = { a: { name: "alice" }, b: { name: "bob" } };
    const [next] = produceWithPatches(base, (d) => {
      d.a = d.b;
    });
    expect(next.a).toEqual({ name: "bob" });
  });

  it("should safely handle Symbol keys without putting them into JSON patches", () => {
    const sym = Symbol("test");
    const base = { a: 1 };
    const [next, patches] = produceWithPatches(base, (d: any) => {
      d[sym] = "symbol_value";
      d.a = 2;
    });
    expect(next.a).toBe(2);
    expect((next as any)[sym]).toBe("symbol_value");
    expect(patches).toEqual([{ op: "replace", path: ["a"], value: 2 }]);
  });
});

describe("applyPatches", () => {
  it("should apply replace patches", () => {
    const base = { a: 1, b: 2 };
    const result = applyPatches(base, [{ op: "replace", path: ["a"], value: 10 }]);
    expect(result).toEqual({ a: 10, b: 2 });
    expect(base.a).toBe(1); // Original unchanged
  });

  it("should apply add patches", () => {
    const base: Record<string, number> = { a: 1 };
    const result = applyPatches(base, [{ op: "add", path: ["b"], value: 2 }]);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("should apply remove patches", () => {
    const base: Record<string, number> = { a: 1, b: 2 };
    const result = applyPatches(base, [{ op: "remove", path: ["b"] }]);
    expect(result).toEqual({ a: 1 });
  });

  it("should apply root-level replace patch", () => {
    const base = { a: 1 };
    const result = applyPatches(base, [{ op: "replace", path: [], value: { a: 99 } }]);
    expect(result).toEqual({ a: 99 });
  });

  it("should roundtrip applyPatches(base, patches) === nextState", () => {
    const base = { todos: [{ id: "1", text: "Buy milk", done: false }], count: 1 };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.todos.push({ id: "2", text: "Walk dog", done: true });
      d.count = 2;
    });
    const reconstructed = applyPatches(base, patches);
    expect(reconstructed).toEqual(next);
  });

  it("should roundtrip inversePatches: applyPatches(nextState, inversePatches) === base", () => {
    const base = { todos: [{ id: "1", text: "Buy milk", done: false }], count: 1 };
    const [next, , inversePatches] = produceWithPatches(base, (d) => {
      d.todos[0]!.done = true;
      d.count = 2;
    });
    const reconstructed = applyPatches(next, inversePatches);
    expect(reconstructed).toEqual(base);
  });
});

describe("Map support", () => {
  it("should track map.set() as add for new key", () => {
    const base = { data: new Map<string, number>() };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.set("a", 1);
    });
    expect(next.data.get("a")).toBe(1);
    expect(patches).toEqual([{ op: "add", path: ["data", "$entries", "a"], value: 1 }]);
    expect(inverse).toEqual([{ op: "remove", path: ["data", "$entries", "a"] }]);
  });

  it("should track map.set() as replace for existing key", () => {
    const base = { data: new Map([["a", 1]]) };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.set("a", 2);
    });
    expect(next.data.get("a")).toBe(2);
    expect(patches).toEqual([{ op: "replace", path: ["data", "$entries", "a"], value: 2 }]);
    expect(inverse).toEqual([{ op: "replace", path: ["data", "$entries", "a"], value: 1 }]);
  });

  it("should track map.delete()", () => {
    const base = { data: new Map([["a", 1]]) };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.delete("a");
    });
    expect(next.data.has("a")).toBe(false);
    expect(patches).toEqual([{ op: "remove", path: ["data", "$entries", "a"] }]);
    expect(inverse).toEqual([{ op: "add", path: ["data", "$entries", "a"], value: 1 }]);
  });

  it("should track map.clear()", () => {
    const base = { data: new Map([["a", 1], ["b", 2]]) };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.clear();
    });
    expect(next.data.size).toBe(0);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toEqual({ op: "remove", path: ["data", "$entries", "a"] });
    expect(patches[1]).toEqual({ op: "remove", path: ["data", "$entries", "b"] });
    expect(inverse).toHaveLength(2);
    expect(inverse[0]).toEqual({ op: "add", path: ["data", "$entries", "a"], value: 1 });
    expect(inverse[1]).toEqual({ op: "add", path: ["data", "$entries", "b"], value: 2 });
  });

  it("should preserve immutability on map.set()", () => {
    const base = { data: new Map([["a", 1]]) };
    const [next] = produceWithPatches(base, (d) => {
      d.data.set("a", 2);
    });
    expect(base.data.get("a")).toBe(1);
    expect(next.data.get("a")).toBe(2);
    expect(base.data).not.toBe(next.data);
  });

  it("should handle map.get() in draft", () => {
    const base = { data: new Map([["a", 1]]) };
    const [next] = produceWithPatches(base, (d) => {
      const val = d.data.get("a");
      d.data.set("a", val! + 1);
    });
    expect(next.data.get("a")).toBe(2);
  });

  it("should handle map.has() in draft", () => {
    const base = { data: new Map([["a", 1]]) };
    const [, patches] = produceWithPatches(base, (d) => {
      if (!d.data.has("b")) {
        d.data.set("b", 2);
      }
    });
    expect(patches).toEqual([{ op: "add", path: ["data", "$entries", "b"], value: 2 }]);
  });

  it("should handle map.size in draft", () => {
    const base = { data: new Map([["a", 1]]) };
    const [, patches] = produceWithPatches(base, (d) => {
      if (d.data.size === 1) {
        d.data.set("b", 2);
      }
    });
    expect(patches).toEqual([{ op: "add", path: ["data", "$entries", "b"], value: 2 }]);
  });

  it("should roundtrip Map patches: applyPatches === nextState", () => {
    const base = { data: new Map([["a", 1]]) };
    const [, patches] = produceWithPatches(base, (d) => {
      d.data.set("a", 2);
      d.data.set("b", 3);
    });
    const reconstructed = applyPatches(base, patches);
    expect(reconstructed.data.get("a")).toBe(2);
    expect(reconstructed.data.get("b")).toBe(3);
  });

  it("should roundtrip inversePatches: applyPatches(nextState, inversePatches) === base", () => {
    const base = { data: new Map([["a", 1]]) };
    const [next, , inversePatches] = produceWithPatches(base, (d) => {
      d.data.set("a", 2);
      d.data.set("b", 3);
    });
    const reconstructed = applyPatches(next, inversePatches);
    expect(reconstructed.data.has("a")).toBe(true);
    expect(reconstructed.data.get("a")).toBe(1);
    expect(reconstructed.data.has("b")).toBe(false);
  });

  it("should handle no-op on map without changes", () => {
    const base = { data: new Map([["a", 1]]) };
    const [next, patches, inverse] = produceWithPatches(base, (_d) => {
      // no op
    });
    expect(next).toBe(base);
    expect(patches).toHaveLength(0);
    expect(inverse).toHaveLength(0);
  });

  it("should handle multiple map operations in one produce", () => {
    const base = { data: new Map<string, number>() };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.set("x", 10);
      d.data.set("y", 20);
      d.data.delete("x");
      d.data.set("z", 30);
    });
    expect(next.data.has("x")).toBe(false);
    expect(next.data.get("y")).toBe(20);
    expect(next.data.get("z")).toBe(30);
    expect(patches).toHaveLength(4);
    expect(inverse).toHaveLength(4);
  });
});

describe("Set support", () => {
  it("should track set.add() as add", () => {
    const base = { data: new Set<string>() };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.add("a");
    });
    expect(next.data.has("a")).toBe(true);
    expect(patches).toEqual([{ op: "add", path: ["data", "$values", "a"], value: "a" }]);
    expect(inverse).toEqual([{ op: "remove", path: ["data", "$values", "a"] }]);
  });

  it("should not emit patch when adding duplicate to set", () => {
    const base = { data: new Set(["a"]) };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.add("a");
    });
    expect(next.data.has("a")).toBe(true);
    expect(patches).toHaveLength(0);
    expect(inverse).toHaveLength(0);
  });

  it("should track set.delete()", () => {
    const base = { data: new Set(["a"]) };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.delete("a");
    });
    expect(next.data.has("a")).toBe(false);
    expect(patches).toEqual([{ op: "remove", path: ["data", "$values", "a"] }]);
    expect(inverse).toEqual([{ op: "add", path: ["data", "$values", "a"], value: "a" }]);
  });

  it("should track set.clear()", () => {
    const base = { data: new Set(["a", "b"]) };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.clear();
    });
    expect(next.data.size).toBe(0);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toEqual({ op: "remove", path: ["data", "$values", "a"] });
    expect(patches[1]).toEqual({ op: "remove", path: ["data", "$values", "b"] });
    expect(inverse).toHaveLength(2);
    expect(inverse[0]).toEqual({ op: "add", path: ["data", "$values", "a"], value: "a" });
    expect(inverse[1]).toEqual({ op: "add", path: ["data", "$values", "b"], value: "b" });
  });

  it("should preserve immutability on set.add()", () => {
    const base = { data: new Set(["a"]) };
    const [next] = produceWithPatches(base, (d) => {
      d.data.add("b");
    });
    expect(base.data.has("b")).toBe(false);
    expect(next.data.has("b")).toBe(true);
    expect(base.data).not.toBe(next.data);
  });

  it("should handle set.has() in draft", () => {
    const base = { data: new Set(["a"]) };
    const [, patches] = produceWithPatches(base, (d) => {
      if (!d.data.has("b")) {
        d.data.add("b");
      }
    });
    expect(patches).toEqual([{ op: "add", path: ["data", "$values", "b"], value: "b" }]);
  });

  it("should handle set.size in draft", () => {
    const base = { data: new Set(["a"]) };
    const [, patches] = produceWithPatches(base, (d) => {
      if (d.data.size === 1) {
        d.data.add("b");
      }
    });
    expect(patches).toEqual([{ op: "add", path: ["data", "$values", "b"], value: "b" }]);
  });

  it("should roundtrip Set patches: applyPatches === nextState", () => {
    const base = { data: new Set<string>() };
    const [, patches] = produceWithPatches(base, (d) => {
      d.data.add("a");
      d.data.add("b");
    });
    const reconstructed = applyPatches(base, patches);
    expect(reconstructed.data.has("a")).toBe(true);
    expect(reconstructed.data.has("b")).toBe(true);
  });

  it("should roundtrip inversePatches: applyPatches(nextState, inversePatches) === base", () => {
    const base = { data: new Set(["a"]) };
    const [next, , inversePatches] = produceWithPatches(base, (d) => {
      d.data.add("b");
    });
    const reconstructed = applyPatches(next, inversePatches);
    expect(reconstructed.data.has("a")).toBe(true);
    expect(reconstructed.data.has("b")).toBe(false);
  });

  it("should handle no-op on set without changes", () => {
    const base = { data: new Set(["a"]) };
    const [next, patches, inverse] = produceWithPatches(base, (_d) => {
      // no op
    });
    expect(next).toBe(base);
    expect(patches).toHaveLength(0);
    expect(inverse).toHaveLength(0);
  });

  it("should handle multiple set operations in one produce", () => {
    const base = { data: new Set<string>() };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.add("x");
      d.data.add("y");
      d.data.delete("x");
      d.data.add("z");
    });
    expect(next.data.has("x")).toBe(false);
    expect(next.data.has("y")).toBe(true);
    expect(next.data.has("z")).toBe(true);
    expect(patches).toHaveLength(4);
    expect(inverse).toHaveLength(4);
  });
});

describe("Map & Set edge cases", () => {
  it("should not create patch when map.set same value", () => {
    const base = { data: new Map([["a", 1]]) };
    const [next, patches, inverse] = produceWithPatches(base, (d) => {
      d.data.set("a", 1);
    });
    expect(next).toBe(base);
    expect(patches).toHaveLength(0);
    expect(inverse).toHaveLength(0);
  });

  it("should handle number keys in Map", () => {
    const base = { data: new Map<string | number, number>() };
    const [next, patches] = produceWithPatches(base, (d) => {
      (d.data as Map<any, number>).set(42, 100);
    });
    expect(next.data.get(42 as any)).toBe(100);
    expect(patches).toEqual([{ op: "add", path: ["data", "$entries", "42"], value: 100 }]);
    const reconstructed = applyPatches(base, patches);
    expect(reconstructed.data.get("42" as any)).toBe(100);
  });

  it("should throw on object key for Map", () => {
    const base = { data: new Map<any, number>() };
    expect(() => {
      produceWithPatches(base, (d) => {
        d.data.set({ id: 1 } as any, 99);
      });
    }).toThrow(/Map\/Set key must be string or number/);
  });

  it("should throw on object value for Set", () => {
    const base = { data: new Set<any>() };
    expect(() => {
      produceWithPatches(base, (d) => {
        d.data.add({ id: 1 } as any);
      });
    }).toThrow(/Map\/Set key must be string or number/);
  });

  it("should handle clear on empty Map as no-op", () => {
    const base = { data: new Map() };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.data.clear();
    });
    expect(next).toBe(base);
    expect(patches).toHaveLength(0);
  });

  it("should handle clear on empty Set as no-op", () => {
    const base = { data: new Set() };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.data.clear();
    });
    expect(next).toBe(base);
    expect(patches).toHaveLength(0);
  });

  it("should support chaining map.set", () => {
    const base = { data: new Map<string, number>() };
    const [next] = produceWithPatches(base, (d) => {
      d.data.set("a", 1).set("b", 2).set("c", 3);
    });
    expect(next.data.get("a")).toBe(1);
    expect(next.data.get("b")).toBe(2);
    expect(next.data.get("c")).toBe(3);
  });

  it("should support chaining set.add", () => {
    const base = { data: new Set<string>() };
    const [next] = produceWithPatches(base, (d) => {
      (d.data.add("a") as unknown as Set<string>).add("b");
    });
    expect(next.data.has("a")).toBe(true);
    expect(next.data.has("b")).toBe(true);
  });

  it("should handle nested mutation via Map.get", () => {
    const base = { data: new Map([["user", { count: 1 }]]) };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.data.get("user")!.count = 2;
    });
    expect(next.data.get("user")!.count).toBe(2);
    expect(base.data.get("user")!.count).toBe(1);
    expect(patches.length).toBeGreaterThan(0);
  });

  it("should preserve Date values through Map and applyPatches", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const base = { data: new Map([["d", date]]) };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.data.set("d2", new Date("2026-02-02T00:00:00.000Z"));
    });
    expect(next.data.get("d2")).toBeInstanceOf(Date);
    const reconstructed = applyPatches(base, patches);
    expect(reconstructed.data.get("d2")).toBeInstanceOf(Date);
    expect((reconstructed.data.get("d2") as Date).toISOString()).toBe("2026-02-02T00:00:00.000Z");
    expect(reconstructed.data.get("d")!.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("should preserve Date in plain object via hybridClone applyPatches", () => {
    const base = { createdAt: new Date("2026-01-01T00:00:00.000Z"), count: 1 };
    const [next, patches] = produceWithPatches(base, (d) => {
      d.count = 2;
    });
    expect(next.createdAt).toBeInstanceOf(Date);
    const reconstructed = applyPatches(base, patches);
    expect(reconstructed.createdAt).toBeInstanceOf(Date);
  });

  it("should handle Symbol.iterator on Map and Set", () => {
    const base = { m: new Map([["a", 1]]), s: new Set(["x"]) };
    const [next] = produceWithPatches(base, (d) => {
      for (const [k, v] of d.m) {
        if (k === "a") d.m.set("b", v + 1);
      }
      for (const v of d.s) {
        if (v === "x") d.s.add("y");
      }
    });
    expect(next.m.get("b")).toBe(2);
    expect(next.s.has("y")).toBe(true);
  });
});

