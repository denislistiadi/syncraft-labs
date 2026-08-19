import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSyncStore } from "../store.js";
import { deepFreeze, isDevMode } from "../guards.js";

describe("deepFreeze utility", () => {
  it("should safely return primitive values", () => {
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze(undefined)).toBeUndefined();
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze("syncraft")).toBe("syncraft");
    expect(deepFreeze(true)).toBe(true);
  });

  it("should freeze shallow objects", () => {
    const obj = { name: "Alice", age: 30 };
    const frozen = deepFreeze(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(() => {
      (frozen as any).age = 31;
    }).toThrow(TypeError);
  });

  it("should recursively freeze nested objects and arrays", () => {
    const state = {
      user: {
        profile: {
          name: "Bob",
          tags: ["admin", "dev"],
        },
      },
      items: [{ id: 1, text: "Task 1" }],
    };

    const frozen = deepFreeze(state);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.user)).toBe(true);
    expect(Object.isFrozen(frozen.user.profile)).toBe(true);
    expect(Object.isFrozen(frozen.user.profile.tags)).toBe(true);
    expect(Object.isFrozen(frozen.items)).toBe(true);
    expect(Object.isFrozen(frozen.items[0])).toBe(true);

    expect(() => {
      (frozen.user.profile as any).name = "Charlie";
    }).toThrow(TypeError);

    expect(() => {
      frozen.user.profile.tags.push("superadmin");
    }).toThrow(TypeError);

    expect(() => {
      (frozen.items[0] as any).text = "Modified";
    }).toThrow(TypeError);

    expect(() => {
      frozen.items.push({ id: 2, text: "Task 2" });
    }).toThrow(TypeError);
  });

  it("should safely handle DAG structures with shared references", () => {
    const shared = { sharedKey: "value" };
    const root = {
      refA: shared,
      refB: shared,
    };

    const frozen = deepFreeze(root);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.refA)).toBe(true);
    expect(Object.isFrozen(frozen.refB)).toBe(true);
    expect(frozen.refA).toBe(frozen.refB);
  });
});

describe("SyncStore dev-mode state freezing", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("should freeze initialState in development mode", async () => {
    const key = `test-freeze-init-${Date.now()}`;
    const initial = { count: 0, items: ["apple"] };
    const store = createSyncStore({
      storageKey: key,
      initialState: initial,
    });

    await store.hydrate();
    const snapshot = store.getSnapshot();

    expect(snapshot).toBeDefined();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.items)).toBe(true);

    expect(() => {
      if (snapshot) {
        (snapshot as any).count = 100;
      }
    }).toThrow(TypeError);

    expect(() => {
      snapshot?.items.push("banana");
    }).toThrow(TypeError);

    store.destroy();
  });

  it("should freeze state returned by set() in development mode", async () => {
    const key = `test-freeze-set-${Date.now()}`;
    const store = createSyncStore({
      storageKey: key,
      initialState: {
        user: { name: "Alice" },
        todos: [{ id: 1, done: false }],
      },
    });

    await store.hydrate();

    // Mutating via set() should succeed without throwing
    await store.set((draft) => {
      draft.user.name = "Alice Updated";
      draft.todos.push({ id: 2, done: true });
    });

    const snapshot = store.getSnapshot();
    expect(snapshot?.user.name).toBe("Alice Updated");
    expect(snapshot?.todos.length).toBe(2);

    // State produced after set() must be frozen
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.user)).toBe(true);
    expect(Object.isFrozen(snapshot?.todos)).toBe(true);
    expect(Object.isFrozen(snapshot?.todos[0])).toBe(true);
    expect(Object.isFrozen(snapshot?.todos[1])).toBe(true);

    // Direct mutation outside set() must throw
    expect(() => {
      if (snapshot) {
        (snapshot.user as any).name = "Direct Mutation";
      }
    }).toThrow(TypeError);

    expect(() => {
      snapshot?.todos.push({ id: 3, done: false });
    }).toThrow(TypeError);

    // A subsequent set() call should still work seamlessly
    await store.set((draft) => {
      draft.todos[0]!.done = true;
    });

    const nextSnapshot = store.getSnapshot();
    expect(nextSnapshot?.todos[0]?.done).toBe(true);
    expect(Object.isFrozen(nextSnapshot)).toBe(true);

    store.destroy();
  });

  it("should provide frozen state to subscribers in dev mode", async () => {
    const key = `test-freeze-sub-${Date.now()}`;
    const store = createSyncStore({
      storageKey: key,
      initialState: { counter: 0 },
    });

    await store.hydrate();

    let receivedState: { counter: number } | undefined;
    store.subscribe((state) => {
      receivedState = state;
    });

    await store.set((draft) => {
      draft.counter = 42;
    });

    expect(receivedState).toBeDefined();
    expect(receivedState?.counter).toBe(42);
    expect(Object.isFrozen(receivedState)).toBe(true);

    expect(() => {
      if (receivedState) {
        (receivedState as any).counter = 999;
      }
    }).toThrow(TypeError);

    store.destroy();
  });

  it("should freeze state hydrated from IndexedDB in dev mode", async () => {
    const key = `test-freeze-hydrate-${Date.now()}`;
    const store1 = createSyncStore({
      storageKey: key,
      initialState: { profile: { theme: "light" } },
    });

    await store1.hydrate();
    await store1.set((draft) => {
      draft.profile.theme = "dark";
    });
    store1.destroy();

    // Create a new store instance to read persisted state from IDB
    const store2 = createSyncStore<{ profile: { theme: string } }>({
      storageKey: key,
    });

    const hydrated = await store2.hydrate();
    expect(hydrated?.profile.theme).toBe("dark");
    expect(Object.isFrozen(hydrated)).toBe(true);
    expect(Object.isFrozen(hydrated?.profile)).toBe(true);

    expect(() => {
      if (hydrated) {
        (hydrated.profile as any).theme = "system";
      }
    }).toThrow(TypeError);

    store2.destroy();
  });

  it("should NOT freeze state in production mode", async () => {
    process.env.NODE_ENV = "production";
    expect(isDevMode()).toBe(false);

    const key = `test-freeze-prod-${Date.now()}`;
    const store = createSyncStore({
      storageKey: key,
      initialState: { count: 0, items: ["item1"] },
    });

    await store.hydrate();

    await store.set((draft) => {
      draft.count = 1;
    });

    const snapshot = store.getSnapshot();
    expect(snapshot?.count).toBe(1);

    // In production, object is NOT frozen
    expect(Object.isFrozen(snapshot)).toBe(false);
    expect(Object.isFrozen(snapshot?.items)).toBe(false);

    // Direct mutation does NOT throw in production mode
    expect(() => {
      if (snapshot) {
        snapshot.count = 2;
        snapshot.items.push("item2");
      }
    }).not.toThrow();

    store.destroy();
  });
});
