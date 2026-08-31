import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { produceWithPatches, applyPatches } from "../produce.js";

describe("Map property-based tests", () => {
  it("patch + inversePatch are reversible for map.set()", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer(),
        fc.integer(),
        (key, oldVal, newVal) => {
          const base = { data: new Map([[key, oldVal]]) };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            d.data.set(key, newVal);
          });
          const reconstructed = applyPatches(next, inversePatches);
          expect(reconstructed.data.get(key)).toBe(oldVal);
          expect(reconstructed.data.size).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("patch + inversePatch are reversible for map.delete()", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer(),
        (key, val) => {
          const base = { data: new Map([[key, val]]) };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            d.data.delete(key);
          });
          const reconstructed = applyPatches(next, inversePatches);
          expect(reconstructed.data.has(key)).toBe(true);
          expect(reconstructed.data.get(key)).toBe(val);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("patch + inversePatch are reversible for map.clear()", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string(), fc.integer()), { minLength: 1, maxLength: 10 }),
        (entries) => {
          const base = { data: new Map(entries) };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            d.data.clear();
          });
          const reconstructed = applyPatches(next, inversePatches);
          for (const [k, v] of base.data) {
            expect(reconstructed.data.get(k)).toBe(v);
          }
          expect(reconstructed.data.size).toBe(base.data.size);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("applyPatches produces same result as produceWithPatches for map.set()", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer(),
        fc.integer(),
        (key, oldVal, newVal) => {
          const base = { data: new Map([[key, oldVal]]) };
          const [next, patches] = produceWithPatches(base, (d) => {
            d.data.set(key, newVal);
          });
          const reconstructed = applyPatches(base, patches);
          expect(reconstructed.data.get(key)).toBe(next.data.get(key));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("multiple map operations are reversible", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
        (keys) => {
          const base = { data: new Map<string, number>() };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            for (const k of keys) {
              d.data.set(k, k.length);
            }
          });
          const reconstructed = applyPatches(next, inversePatches);
          expect(reconstructed.data.size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Set property-based tests", () => {
  it("patch + inversePatch are reversible for set.add()", () => {
    fc.assert(
      fc.property(
        fc.string(),
        (val) => {
          const base = { data: new Set<string>() };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            d.data.add(val);
          });
          const reconstructed = applyPatches(next, inversePatches);
          expect(reconstructed.data.has(val)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("patch + inversePatch are reversible for set.delete()", () => {
    fc.assert(
      fc.property(
        fc.string(),
        (val) => {
          const base = { data: new Set([val]) };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            d.data.delete(val);
          });
          const reconstructed = applyPatches(next, inversePatches);
          expect(reconstructed.data.has(val)).toBe(true);
          expect(reconstructed.data.size).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("patch + inversePatch are reversible for set.clear()", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        (values) => {
          const base = { data: new Set(values) };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            d.data.clear();
          });
          const reconstructed = applyPatches(next, inversePatches);
          for (const v of base.data) {
            expect(reconstructed.data.has(v)).toBe(true);
          }
          expect(reconstructed.data.size).toBe(base.data.size);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("applyPatches produces same result as produceWithPatches for set.add()", () => {
    fc.assert(
      fc.property(
        fc.string(),
        (val) => {
          const base = { data: new Set<string>() };
          const [next, patches] = produceWithPatches(base, (d) => {
            d.data.add(val);
          });
          const reconstructed = applyPatches(base, patches);
          expect(reconstructed.data.has(val)).toBe(next.data.has(val));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("multiple set operations are reversible", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
        (values) => {
          const base = { data: new Set<string>() };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            for (const v of values) {
              d.data.add(v);
            }
          });
          const reconstructed = applyPatches(next, inversePatches);
          expect(reconstructed.data.size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("duplicate add does not create additional patches", () => {
    fc.assert(
      fc.property(
        fc.string(),
        (val) => {
          const base = { data: new Set<string>() };
          const [, patches] = produceWithPatches(base, (d) => {
            d.data.add(val);
            d.data.add(val);
          });
          expect(patches).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Map/Set combined property-based tests", () => {
  it("nested map inside object is reversible", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer(),
        fc.integer(),
        (key, oldVal, newVal) => {
          const base = { nested: { data: new Map([[key, oldVal]]) } };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            d.nested.data.set(key, newVal);
          });
          const reconstructed = applyPatches(next, inversePatches);
          expect(reconstructed.nested.data.get(key)).toBe(oldVal);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("set inside object is reversible", () => {
    fc.assert(
      fc.property(
        fc.string(),
        (val) => {
          const base = { nested: { data: new Set<string>() } };
          const [next, , inversePatches] = produceWithPatches(base, (d) => {
            d.nested.data.add(val);
          });
          const reconstructed = applyPatches(next, inversePatches);
          expect(reconstructed.nested.data.has(val)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
