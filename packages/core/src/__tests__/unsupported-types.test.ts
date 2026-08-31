import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isUnsupportedType, validateStateShape } from "../guards.js";
import { produceWithPatches } from "../produce.js";
import { createSyncStore } from "../store.js";

class CustomEntity {
  constructor(public id: string, public name: string) {}
}

class UserAccount {
  constructor(public email: string) {}
}

describe("isUnsupportedType utility", () => {
  it("should return false for primitives", () => {
    expect(isUnsupportedType(null)).toBe(false);
    expect(isUnsupportedType(undefined)).toBe(false);
    expect(isUnsupportedType(123)).toBe(false);
    expect(isUnsupportedType("hello")).toBe(false);
    expect(isUnsupportedType(true)).toBe(false);
    expect(isUnsupportedType(Symbol("sym"))).toBe(false);
    expect(isUnsupportedType(42n)).toBe(false);
  });

  it("should return false for plain objects and arrays", () => {
    expect(isUnsupportedType({})).toBe(false);
    expect(isUnsupportedType({ a: 1, b: "two" })).toBe(false);
    expect(isUnsupportedType(Object.create(null))).toBe(false);
    expect(isUnsupportedType([])).toBe(false);
    expect(isUnsupportedType([1, "a", {}])).toBe(false);
  });

  it("should return false for Date instances (leaf-only supported)", () => {
    expect(isUnsupportedType(new Date())).toBe(false);
  });

  it("should return false for Map and Set instances", () => {
    expect(isUnsupportedType(new Map())).toBe(false);
    expect(isUnsupportedType(new Set())).toBe(false);
  });

  it("should return true for functions", () => {
    expect(isUnsupportedType(() => {})).toBe(true);
    expect(isUnsupportedType(function named() {})).toBe(true);
  });

  it("should return true for other built-in unsupported types", () => {
    expect(isUnsupportedType(new WeakMap())).toBe(true);
    expect(isUnsupportedType(new WeakSet())).toBe(true);
    expect(isUnsupportedType(/abc/g)).toBe(true);
    expect(isUnsupportedType(new RegExp("abc"))).toBe(true);
    expect(isUnsupportedType(new Error("err"))).toBe(true);
    expect(isUnsupportedType(Promise.resolve())).toBe(true);
    expect(isUnsupportedType(new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it("should return true for custom class instances", () => {
    expect(isUnsupportedType(new CustomEntity("1", "Test"))).toBe(true);
    expect(isUnsupportedType(new UserAccount("alice@example.com"))).toBe(true);
  });
});

describe("validateStateShape utility", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("should pass without error or warning for valid plain state", () => {
    const valid = {
      name: "Syncraft",
      count: 42,
      active: true,
      tags: ["state", "sync"],
      nested: {
        a: 1,
        b: [null, undefined, "ok"],
      },
    };

    expect(() => validateStateShape(valid)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should pass for null prototype objects", () => {
    const obj = Object.create(null);
    obj.foo = "bar";
    expect(() => validateStateShape(obj)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should pass for DAGs with shared references without double checking", () => {
    const shared = { key: "value" };
    const dag = {
      left: shared,
      right: shared,
      items: [shared, shared],
    };

    expect(() => validateStateShape(dag)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should warn on Date objects and specify the path", () => {
    const state = {
      user: {
        createdAt: new Date("2026-01-01"),
      },
    };

    expect(() => validateStateShape(state)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(
      /Date detected at path "user\.createdAt"/,
    );
  });

  it("should include context in Date warning if provided", () => {
    const state = { date: new Date() };
    validateStateShape(state, "hydrate()");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Date detected at path "date" during hydrate()'),
    );
  });

  it("should pass for Map instances", () => {
    const state = {
      cache: {
        entries: new Map(),
      },
    };

    expect(() => validateStateShape(state)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should pass for Set instances inside an array", () => {
    const state = {
      items: [1, new Set([1, 2]), 3],
    };

    expect(() => validateStateShape(state)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should throw when encountering a custom class instance", () => {
    const state = {
      users: {
        admin: new UserAccount("admin@test.com"),
      },
    };

    expect(() => validateStateShape(state)).toThrowError(
      /Unsupported type "UserAccount" detected at path "users\.admin"/,
    );
  });

  it("should throw when encountering a RegExp", () => {
    const state = { pattern: /test-pattern/i };

    expect(() => validateStateShape(state)).toThrowError(
      /Unsupported type "RegExp" detected at path "pattern"/,
    );
  });

  it("should throw when encountering a function in state", () => {
    const state = {
      handlers: {
        onClick: () => {},
      },
    };

    expect(() => validateStateShape(state)).toThrowError(
      /Unsupported type "Function" detected at path "handlers\.onClick"/,
    );
  });

  it("should include context in error messages when provided", () => {
    const state = { entity: new CustomEntity("1", "A") };

    expect(() => validateStateShape(state, "store.hydrate()")).toThrowError(
      /Unsupported type "CustomEntity" detected at path "entity" during store\.hydrate\(\)/,
    );
  });
});

describe("produceWithPatches unsupported type detection", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("should allow Map assignment in draft", () => {
    const base = { cache: {} as Record<string, unknown> };

    expect(() => {
      produceWithPatches(base, (draft) => {
        draft.cache.items = new Map();
      });
    }).not.toThrow();
  });

  it("should throw when mutating draft to assign a custom class instance", () => {
    const base = { user: null as unknown };

    expect(() => {
      produceWithPatches(base, (draft) => {
        draft.user = new CustomEntity("42", "Alice");
      });
    }).toThrowError(
      /Unsupported type "CustomEntity" detected at path "user"/,
    );
  });

  it("should throw when mutating draft to assign a function", () => {
    const base = { callback: null as unknown };

    expect(() => {
      produceWithPatches(base, (draft) => {
        draft.callback = () => "test";
      });
    }).toThrowError(/Unsupported type "Function" detected at path "callback"/);
  });

  it("should warn but not throw when mutating draft to assign a Date", () => {
    const base = { updatedAt: null as Date | null };

    const [next] = produceWithPatches(base, (draft) => {
      draft.updatedAt = new Date("2026-08-26");
    });

    expect(next.updatedAt).toBeInstanceOf(Date);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("createSyncStore unsupported type guards", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("should throw when createSyncStore is initialized with unsupported class instance", () => {
    expect(() => {
      createSyncStore<{ account: UserAccount }>({
        storageKey: "test-unsupported-init",
        initialState: {
          account: new UserAccount("test@example.com"),
        },
      });
    }).toThrowError(/Unsupported type "UserAccount" detected at path "account"/);
  });

  it("should warn when createSyncStore is initialized with a Date", () => {
    const store = createSyncStore<{ createdAt: Date }>({
      storageKey: "test-date-init",
      initialState: {
        createdAt: new Date("2026-08-26"),
      },
    });

    expect(warnSpy).toHaveBeenCalled();
    store.destroy();
  });

  it("should throw when store.set() assigns an unsupported type", async () => {
    const store = createSyncStore<{ data: Record<string, unknown> }>({
      storageKey: "test-set-unsupported",
      initialState: { data: {} },
    });

    await store.hydrate();

    await expect(
      store.set((draft) => {
        draft.data.pattern = /test/;
      }),
    ).rejects.toThrowError(/Unsupported type "RegExp" detected at path "data\.pattern"/);

    store.destroy();
  });
});

describe("production mode gating", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("should NOT throw when produceWithPatches assigns a class instance in production", () => {
    const base = { user: null as unknown };

    expect(() => {
      produceWithPatches(base, (draft) => {
        draft.user = new CustomEntity("42", "Alice");
      });
    }).not.toThrow();
  });

  it("should NOT throw when createSyncStore is initialized with unsupported class instance in production", () => {
    expect(() => {
      createSyncStore<{ account: UserAccount }>({
        storageKey: "test-prod-gating-init",
        initialState: {
          account: new UserAccount("test@example.com"),
        },
      });
    }).not.toThrow();
  });
});
