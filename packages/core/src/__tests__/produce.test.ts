import { describe, expect, it } from "vitest";
import { produceWithPatches } from "../produce.js";

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
