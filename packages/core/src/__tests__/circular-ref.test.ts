import { describe, expect, it } from "vitest";
import { assertNoCycles } from "../guards.js";
import { produceWithPatches } from "../produce.js";
import { createSyncStore } from "../store.js";

describe("assertNoCycles utility", () => {
  it("should pass for primitive values", () => {
    expect(() => assertNoCycles(null)).not.toThrow();
    expect(() => assertNoCycles(undefined)).not.toThrow();
    expect(() => assertNoCycles(123)).not.toThrow();
    expect(() => assertNoCycles("hello")).not.toThrow();
    expect(() => assertNoCycles(true)).not.toThrow();
  });

  it("should pass for acyclic objects and arrays", () => {
    const state = {
      user: {
        name: "Alice",
        tags: ["admin", "dev"],
      },
      items: [{ id: 1 }, { id: 2 }],
    };
    expect(() => assertNoCycles(state)).not.toThrow();
  });

  it("should allow DAG structures with shared non-circular references (diamonds)", () => {
    const shared = { key: "value" };
    const dag = {
      branchA: { ref: shared },
      branchB: { ref: shared },
      list: [shared, shared],
    };
    expect(() => assertNoCycles(dag)).not.toThrow();
  });

  it("should detect direct self-reference and throw with path", () => {
    const obj: Record<string, unknown> = { name: "direct" };
    obj.self = obj;

    expect(() => assertNoCycles(obj)).toThrowError(
      /Circular reference detected at path "self"/,
    );
  });

  it("should detect deep indirect circular reference and throw with path", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b" };
    const c: Record<string, unknown> = { name: "c" };

    a.b = b;
    b.c = c;
    c.loop = a;

    expect(() => assertNoCycles(a)).toThrowError(
      /Circular reference detected at path "b\.c\.loop"/,
    );
  });

  it("should detect circular references within arrays", () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr);

    expect(() => assertNoCycles(arr)).toThrowError(
      /Circular reference detected at path "2"/,
    );
  });

  it("should include context in the error message when provided", () => {
    const obj: Record<string, unknown> = {};
    obj.cycle = obj;

    expect(() => assertNoCycles(obj, "hydrate()")).toThrowError(
      /Circular reference detected at path "cycle" during hydrate\(\)/,
    );
  });
});

describe("produceWithPatches circular reference detection", () => {
  it("should throw when baseState contains a direct circular reference", () => {
    const base: Record<string, unknown> = { count: 0 };
    base.self = base;

    expect(() => {
      produceWithPatches(base, (draft) => {
        draft.count = 1;
      });
    }).toThrowError(/Circular reference detected at path "self"/);
  });

  it("should throw when baseState contains a deep circular reference", () => {
    const base: Record<string, unknown> = {
      user: {
        profile: {},
      },
    };
    (base.user as Record<string, unknown>).profile = base.user;

    expect(() => {
      produceWithPatches(base, (draft) => {
        (draft.user as Record<string, unknown>).name = "Bob";
      });
    }).toThrowError(/Circular reference detected at path "user\.profile"/);
  });

  it("should throw when updater creates a circular reference by linking drafts", () => {
    const base = {
      user: {
        profile: {
          bio: "developer",
        },
      },
    };

    expect(() => {
      produceWithPatches(base, (draft: Record<string, unknown>) => {
        const user = draft.user as Record<string, unknown>;
        const profile = user.profile as Record<string, unknown>;
        profile.userRef = user;
      });
    }).toThrowError(
      /Circular reference detected at path "user\.profile\.userRef"/,
    );
  });

  it("should throw when updater assigns an object with a circular reference", () => {
    const base = { items: [] as unknown[] };

    expect(() => {
      produceWithPatches(base, (draft) => {
        const circularItem: Record<string, unknown> = { id: 1 };
        circularItem.self = circularItem;
        draft.items.push(circularItem);
      });
    }).toThrowError(/Circular reference detected at path "items\.0\.self"/);
  });

  it("should throw when updater returns a replacement state containing a circular reference", () => {
    const base = { count: 0 };

    expect(() => {
      produceWithPatches(base, () => {
        const replacement: Record<string, unknown> = { count: 10 };
        replacement.loop = replacement;
        return replacement as typeof base;
      });
    }).toThrowError(/Circular reference detected at path "loop"/);
  });

  it("should continue to work normally for valid non-circular mutations", () => {
    const base = {
      user: { name: "Alice" },
      tags: ["ts", "js"],
    };

    const [next, patches] = produceWithPatches(base, (draft) => {
      draft.user.name = "Alice Updated";
      draft.tags.push("node");
    });

    expect(next.user.name).toBe("Alice Updated");
    expect(next.tags).toEqual(["ts", "js", "node"]);
    expect(patches.length).toBeGreaterThan(0);
  });
});

describe("SyncStore circular reference prevention", () => {
  it("should throw when creating a store with circular initialState in dev mode", () => {
    const key = `test-cycle-store-init-${Date.now()}`;
    const circularState: Record<string, unknown> = { name: "app" };
    circularState.self = circularState;

    expect(() => {
      createSyncStore({
        storageKey: key,
        initialState: circularState,
      });
    }).toThrowError(/Circular reference detected at path "self"/);
  });

  it("should throw when set() updater attempts to form a circular reference", async () => {
    const key = `test-cycle-store-set-${Date.now()}`;
    const store = createSyncStore<{ user: Record<string, unknown> }>({
      storageKey: key,
      initialState: { user: { name: "Alice" } },
    });

    await store.hydrate();

    await expect(
      store.set((draft) => {
        const cyclicObj: Record<string, unknown> = { title: "loop" };
        cyclicObj.parent = cyclicObj;
        draft.user.cycle = cyclicObj;
      }),
    ).rejects.toThrowError(/Circular reference detected at path/);

    // Verify store is intact and snapshot is still the valid previous state
    const snapshot = store.getSnapshot();
    expect(snapshot?.user.name).toBe("Alice");
    expect(snapshot?.user.cycle).toBeUndefined();

    store.destroy();
  });
});
