/**
 * @module @syncraft-labs/core/__tests__/store.test
 *
 * Unit tests for the core SyncStore.
 *
 * Uses `fake-indexeddb` (injected via setup.ts) to simulate IndexedDB
 * in the Node.js test environment. Each test gets a fresh store with
 * a unique key to avoid cross-test contamination.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createSyncStore } from "../store.js";
import type { SyncStore } from "../types.js";
import * as storage from "../storage.js";

// ─────────────────────────────────────────────────────────────
// Test State Shape
// ─────────────────────────────────────────────────────────────

interface TodoState {
  todos: Array<{
    id: string;
    text: string;
    done: boolean;
  }>;
  lastUpdated: number;
}

const INITIAL_STATE: TodoState = {
  todos: [],
  lastUpdated: 0,
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Generate a unique storage key to isolate each test's IndexedDB. */
let testCounter = 0;
function uniqueKey(): string {
  testCounter += 1;
  return `test-store-${testCounter}-${Date.now()}`;
}

/** Create a store, hydrate it, and return it ready to use. */
async function createHydratedStore(
  overrides?: Partial<{ storageKey: string; initialState: TodoState }>,
): Promise<SyncStore<TodoState>> {
  const store = createSyncStore<TodoState>({
    storageKey: overrides?.storageKey ?? uniqueKey(),
    initialState: overrides?.initialState ?? INITIAL_STATE,
  });
  await store.hydrate();
  return store;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("createSyncStore", () => {
  // ── Hydration ─────────────────────────────────────────────

  describe("hydration", () => {
    it("should return undefined from getSnapshot() before hydration", () => {
      // Suppress the expected dev warning for this test
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = createSyncStore<TodoState>({
        storageKey: uniqueKey(),
        initialState: INITIAL_STATE,
      });

      // Before hydrate() is called, the in-memory cache is empty
      expect(store.getSnapshot()).toBeUndefined();

      warnSpy.mockRestore();
      store.destroy();
    });

    it("should populate memory with initialState after hydration", async () => {
      const store = await createHydratedStore();

      const state = store.getSnapshot();
      expect(state).toEqual(INITIAL_STATE);
      expect(state?.todos).toHaveLength(0);

      store.destroy();
    });

    it("should return initialState from get() after hydration", async () => {
      const store = await createHydratedStore();

      const state = await store.get();
      expect(state).toEqual(INITIAL_STATE);

      store.destroy();
    });

    it("should persist initialState to IndexedDB on first hydration", async () => {
      const key = uniqueKey();
      const store1 = await createHydratedStore({ storageKey: key });
      store1.destroy();

      // Create a NEW store with the same key but NO initialState.
      // It should read the persisted initialState from IDB.
      const store2 = createSyncStore<TodoState>({
        storageKey: key,
      });
      await store2.hydrate();

      const state = store2.getSnapshot();
      expect(state).toEqual(INITIAL_STATE);

      store2.destroy();
    });

    it("should return undefined if no initialState and no persisted data", async () => {
      const store = createSyncStore<TodoState>({
        storageKey: uniqueKey(),
        // No initialState!
      });
      await store.hydrate();

      expect(store.getSnapshot()).toBeUndefined();
      expect(await store.get()).toBeUndefined();

      store.destroy();
    });

    it("should not double-hydrate", async () => {
      const store = await createHydratedStore();

      // Mutate state
      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "Test", done: false });
      });

      // Hydrate again — should NOT reset to initialState
      await store.hydrate();

      const state = store.getSnapshot();
      expect(state?.todos).toHaveLength(1);

      store.destroy();
    });
  });

  // ── set() & In-Memory State ────────────────────────────────

  describe("set()", () => {
    it("should update in-memory state immediately", async () => {
      const store = await createHydratedStore();

      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "Buy milk", done: false });
        draft.lastUpdated = 1000;
      });

      const state = store.getSnapshot();
      expect(state?.todos).toHaveLength(1);
      expect(state?.todos[0]).toEqual({
        id: "1",
        text: "Buy milk",
        done: false,
      });
      expect(state?.lastUpdated).toBe(1000);

      store.destroy();
    });

    it("should persist state to IndexedDB", async () => {
      const key = uniqueKey();
      const store1 = await createHydratedStore({ storageKey: key });

      await store1.set((draft) => {
        draft.todos.push({ id: "1", text: "Persist me", done: false });
      });
      store1.destroy();

      // Create a new store with the same key — it should read the persisted state
      const store2 = createSyncStore<TodoState>({ storageKey: key });
      await store2.hydrate();

      const state = store2.getSnapshot();
      expect(state?.todos).toHaveLength(1);
      expect(state?.todos[0]?.text).toBe("Persist me");

      store2.destroy();
    });

    it("should create an outbox entry with patches", async () => {
      const store = await createHydratedStore();

      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "Outbox test", done: false });
      });

      const outbox = await store.getOutbox();
      expect(outbox).toHaveLength(1);

      const entry = outbox[0]!;
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.patches.length).toBeGreaterThan(0);
      expect(entry.inversePatches.length).toBeGreaterThan(0);
      expect(entry.snapshot.todos).toHaveLength(1);

      store.destroy();
    });

    it("should accumulate multiple outbox entries", async () => {
      const store = await createHydratedStore();

      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "First", done: false });
      });
      await store.set((draft) => {
        draft.todos.push({ id: "2", text: "Second", done: false });
      });
      await store.set((draft) => {
        draft.todos[0]!.done = true;
      });

      const outbox = await store.getOutbox();
      expect(outbox).toHaveLength(3);

      // Each entry should have a unique ID
      const ids = outbox.map((e) => e.id);
      expect(new Set(ids).size).toBe(3);

      store.destroy();
    });

    it("should skip no-op updates", async () => {
      const store = await createHydratedStore();
      const listener = vi.fn();
      store.subscribe(listener);

      // This updater doesn't actually change anything
      await store.set((_draft) => {
        // intentionally empty — no mutations
      });

      // Listener should NOT have been called (no change)
      expect(listener).not.toHaveBeenCalled();

      // Outbox should be empty (no-op = no entry)
      const outbox = await store.getOutbox();
      expect(outbox).toHaveLength(0);

      store.destroy();
    });

    it("should throw if set() is called without state", async () => {
      const store = createSyncStore<TodoState>({
        storageKey: uniqueKey(),
        // No initialState
      });
      await store.hydrate();

      await expect(
        store.set((draft) => {
          draft.todos.push({ id: "1", text: "Fail", done: false });
        }),
      ).rejects.toThrow("no state exists");

      store.destroy();
    });
  });

  // ── subscribe() ─────────────────────────────────────────────

  describe("subscribe()", () => {
    it("should notify listeners on state change", async () => {
      const store = await createHydratedStore();
      const listener = vi.fn();

      store.subscribe(listener);

      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "Notify me", done: false });
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          todos: [{ id: "1", text: "Notify me", done: false }],
        }),
      );

      store.destroy();
    });

    it("should support multiple listeners", async () => {
      const store = await createHydratedStore();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      store.subscribe(listener1);
      store.subscribe(listener2);

      await store.set((draft) => {
        draft.lastUpdated = 42;
      });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      store.destroy();
    });

    it("should unsubscribe correctly", async () => {
      const store = await createHydratedStore();
      const listener = vi.fn();

      const unsub = store.subscribe(listener);

      await store.set((draft) => {
        draft.lastUpdated = 1;
      });
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsub();

      await store.set((draft) => {
        draft.lastUpdated = 2;
      });
      // Should still be 1 — listener was removed
      expect(listener).toHaveBeenCalledTimes(1);

      store.destroy();
    });
  });

  // ── clearOutbox() ──────────────────────────────────────────

  describe("clearOutbox()", () => {
    it("should remove specific entries by ID", async () => {
      const store = await createHydratedStore();

      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "Entry 1", done: false });
      });
      await store.set((draft) => {
        draft.todos.push({ id: "2", text: "Entry 2", done: false });
      });

      const outbox = await store.getOutbox();
      expect(outbox).toHaveLength(2);

      // Clear only the first entry
      await store.clearOutbox([outbox[0]!.id]);

      const remaining = await store.getOutbox();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe(outbox[1]!.id);

      store.destroy();
    });

    it("should handle clearing non-existent IDs gracefully", async () => {
      const store = await createHydratedStore();

      // Should not throw
      await store.clearOutbox(["non-existent-id"]);

      store.destroy();
    });
  });

  // ── destroy() ──────────────────────────────────────────────

  describe("destroy()", () => {
    it("should throw on operations after destroy", async () => {
      const store = await createHydratedStore();
      store.destroy();

      expect(() => store.subscribe(() => {})).toThrow("destroyed");
      await expect(store.get()).rejects.toThrow("destroyed");
      await expect(
        store.set((draft) => {
          draft.lastUpdated = 1;
        }),
      ).rejects.toThrow("destroyed");
    });

    it("should be idempotent", async () => {
      const store = await createHydratedStore();

      // Multiple destroy calls should not throw
      store.destroy();
      store.destroy();
      store.destroy();
    });
  });

  // ── Cross-session persistence ──────────────────────────────

  describe("cross-session persistence", () => {
    it("should restore state across store instances (simulating page reload)", async () => {
      const key = uniqueKey();

      // Session 1: Create store, add todos
      const store1 = await createHydratedStore({ storageKey: key });
      await store1.set((draft) => {
        draft.todos.push({ id: "1", text: "Survive reload", done: false });
        draft.lastUpdated = 999;
      });
      store1.destroy();

      // Session 2: Create new store with same key — simulates page reload
      const store2 = createSyncStore<TodoState>({ storageKey: key });
      await store2.hydrate();

      const state = store2.getSnapshot();
      expect(state?.todos).toHaveLength(1);
      expect(state?.todos[0]?.text).toBe("Survive reload");
      expect(state?.lastUpdated).toBe(999);

      store2.destroy();
    });

    it("should preserve outbox across store instances", async () => {
      const key = uniqueKey();

      // Session 1: Create entries in outbox
      const store1 = await createHydratedStore({ storageKey: key });
      await store1.set((draft) => {
        draft.todos.push({ id: "1", text: "Pending sync", done: false });
      });
      store1.destroy();

      // Session 2: Outbox should still have the entry
      const store2 = createSyncStore<TodoState>({
        storageKey: key,
        initialState: INITIAL_STATE,
      });
      await store2.hydrate();

      const outbox = await store2.getOutbox();
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.snapshot.todos[0]?.text).toBe("Pending sync");

      store2.destroy();
    });
  });

  // ── Rollback on persistence failure ──────────────────────────

  describe("rollback on persistence failure", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should rollback in-memory state when writeState throws", async () => {
      const store = await createHydratedStore();
      const listener = vi.fn();
      store.subscribe(listener);

      // First mutation — succeeds, establishes baseline
      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "Baseline", done: false });
      });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // Mock writeState to fail on the NEXT call
      const writeStateSpy = vi.spyOn(storage, "writeState")
        .mockRejectedValueOnce(new Error("QuotaExceededError"));

      // Suppress console.error noise in test output
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // This set() should fail and rollback
      await expect(
        store.set((draft) => {
          draft.todos.push({ id: "2", text: "Should rollback", done: false });
        }),
      ).rejects.toThrow("QuotaExceededError");

      // Listener should have been called TWICE:
      // 1. Optimistic update (with the new todo)
      // 2. Rollback (back to baseline state)
      expect(listener).toHaveBeenCalledTimes(2);

      // Final in-memory state should be the baseline (1 todo, not 2)
      const state = store.getSnapshot();
      expect(state?.todos).toHaveLength(1);
      expect(state?.todos[0]?.text).toBe("Baseline");

      // console.error should have been called with Syncraft Labs prefix
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Syncraft Labs] Persistence failed"),
        expect.any(Error),
      );

      writeStateSpy.mockRestore();
      consoleSpy.mockRestore();
      store.destroy();
    });

    it("should rollback in-memory state when pushOutbox throws", async () => {
      const store = await createHydratedStore();

      // First mutation — succeeds
      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "Baseline", done: false });
      });

      // Mock pushOutbox to fail (writeState succeeds but outbox write fails)
      const pushOutboxSpy = vi.spyOn(storage, "pushOutbox")
        .mockRejectedValueOnce(new Error("Outbox write failed"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        store.set((draft) => {
          draft.todos.push({ id: "2", text: "Should rollback", done: false });
        }),
      ).rejects.toThrow("Outbox write failed");

      // State should be rolled back to baseline
      const state = store.getSnapshot();
      expect(state?.todos).toHaveLength(1);
      expect(state?.todos[0]?.text).toBe("Baseline");

      pushOutboxSpy.mockRestore();
      consoleSpy.mockRestore();
      store.destroy();
    });

    it("should allow normal operations after a rollback", async () => {
      const store = await createHydratedStore();

      // First mutation — succeeds
      await store.set((draft) => {
        draft.todos.push({ id: "1", text: "First", done: false });
      });

      // Make writeState fail once
      const writeStateSpy = vi.spyOn(storage, "writeState")
        .mockRejectedValueOnce(new Error("Temporary failure"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // This fails and rolls back
      await expect(
        store.set((draft) => {
          draft.todos.push({ id: "2", text: "Fails", done: false });
        }),
      ).rejects.toThrow("Temporary failure");

      writeStateSpy.mockRestore();
      consoleSpy.mockRestore();

      // The store should still be functional — this should succeed
      await store.set((draft) => {
        draft.todos.push({ id: "3", text: "Recovery", done: false });
      });

      const state = store.getSnapshot();
      expect(state?.todos).toHaveLength(2);
      expect(state?.todos[1]?.text).toBe("Recovery");

      store.destroy();
    });
  });

  // ── Dev-mode warnings ──────────────────────────────────────

  describe("dev-mode pre-hydration warning", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should warn when getSnapshot() is called before hydration in dev mode", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = createSyncStore<TodoState>({
        storageKey: uniqueKey(),
        initialState: INITIAL_STATE,
      });

      // Call getSnapshot() before hydrate() — should trigger warning
      store.getSnapshot();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Syncraft Labs] getSnapshot() called on store"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("before hydrate() completed"),
      );

      warnSpy.mockRestore();
      store.destroy();
    });

    it("should only warn once per store instance (throttled)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = createSyncStore<TodoState>({
        storageKey: uniqueKey(),
        initialState: INITIAL_STATE,
      });

      // Call getSnapshot() multiple times before hydration
      store.getSnapshot();
      store.getSnapshot();
      store.getSnapshot();

      // Warning should only fire once
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
      store.destroy();
    });

    it("should NOT warn after hydration completes", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = await createHydratedStore();

      // Call getSnapshot() after hydration — should NOT warn
      store.getSnapshot();

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
      store.destroy();
    });

    it("should NOT warn in production mode", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = createSyncStore<TodoState>({
        storageKey: uniqueKey(),
        initialState: INITIAL_STATE,
      });

      store.getSnapshot();

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
      store.destroy();
    });
  });

  // ── isHydrating ────────────────────────────────────────────

  describe("isHydrating", () => {
    it("should be true before hydration", () => {
      const store = createSyncStore<TodoState>({
        storageKey: uniqueKey(),
        initialState: INITIAL_STATE,
      });

      expect(store.isHydrating).toBe(true);

      store.destroy();
    });

    it("should be false after hydration completes", async () => {
      const store = await createHydratedStore();

      expect(store.isHydrating).toBe(false);

      store.destroy();
    });

    it("should be false after destroy", () => {
      const store = createSyncStore<TodoState>({
        storageKey: uniqueKey(),
        initialState: INITIAL_STATE,
      });

      expect(store.isHydrating).toBe(true);
      store.destroy();
      expect(store.isHydrating).toBe(false);
    });
  });
});

