/**
 * Tests for the `useSync` Vue composable.
 *
 * Uses @vue/test-utils with a wrapper component pattern
 * to test composables inside a real Vue component lifecycle.
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, type ShallowRef, type Ref } from "vue";
import { createSyncStore, SyncraftError } from "@syncraft-labs/core";
import { createSyncraft, useSync } from "../index.js";

// ─────────────────────────────────────────────────────────────
// Test State Shape
// ─────────────────────────────────────────────────────────────

type TestState = {
  count: number;
  items: string[];
};

const INITIAL_STATE: TestState = { count: 0, items: [] };

let keyCounter = 0;
function uniqueKey(): string {
  keyCounter++;
  return `vue-test-${keyCounter}-${Date.now()}`;
}

/**
 * Custom waitFor helper for Vue composition tests.
 * Periodically executes the assertion until it passes or times out.
 * Needed because IndexedDB uses macro-tasks that aren't flushed by nextTick/flushPromises.
 */
async function waitFor(assertion: () => void, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (true) {
    try {
      assertion();
      return;
    } catch (err) {
      if (Date.now() - start > timeout) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Helper: Mount a composable inside a real component
// ─────────────────────────────────────────────────────────────

interface ComposableResult<T> {
  data: ShallowRef<T | undefined>;
  update: (updater: (draft: T) => void | T) => void;
  refetch: () => Promise<void>;
  isHydrating: Ref<boolean>;
  isSyncing: Ref<boolean>;
  isOffline: Ref<boolean>;
  error: ShallowRef<Error | null>;
  destroyStore: () => void;
}

function mountComposable<T extends Record<string, unknown>>(
  key: string,
  options: Parameters<typeof useSync<T>>[1],
) {
  let result: ComposableResult<T>;

  const TestComponent = defineComponent({
    setup() {
      result = useSync<T>(key, options) as ComposableResult<T>;
      return { result };
    },
    template: "<div></div>",
  });

  const plugin = createSyncraft();
  const wrapper = mount(TestComponent, {
    global: {
      plugins: [plugin],
    },
  });

  return {
    get result() {
      return result;
    },
    wrapper,
    plugin,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("useSync (Vue)", () => {
  describe("Hydration", () => {
    it("should hydrate from IndexedDB with persisted data", async () => {
      const key = uniqueKey();

      // Pre-populate IndexedDB via core directly
      const directStore = createSyncStore<TestState>({
        storageKey: key,
        initialState: INITIAL_STATE,
      });
      await directStore.hydrate();
      await directStore.set((draft) => {
        draft.count = 42;
        draft.items.push("persisted");
      });
      directStore.destroy();

      // Mount composable
      const { result } = mountComposable<TestState>(key, {
        initialState: INITIAL_STATE,
      });

      // Wait for hydration
      await waitFor(() => {
        expect(result.isHydrating.value).toBe(false);
      });

      expect(result.data.value?.count).toBe(42);
      expect(result.data.value?.items).toEqual(["persisted"]);
    });

    it("should use initialState when IndexedDB is empty", async () => {
      const key = uniqueKey();

      const { result } = mountComposable<TestState>(key, {
        initialState: INITIAL_STATE,
      });

      // Wait for hydration
      await waitFor(() => {
        expect(result.isHydrating.value).toBe(false);
      });

      expect(result.data.value?.count).toBe(0);
      expect(result.data.value?.items).toEqual([]);
    });
  });

  describe("Fetcher", () => {
    it("should call fetcher when store is empty after hydration", async () => {
      const key = uniqueKey();

      const fetcher = vi.fn().mockResolvedValue({
        count: 99,
        items: ["from-server"],
      } satisfies TestState);

      const { result } = mountComposable<TestState>(key, { fetcher });

      // Wait for fetcher to populate the data
      await waitFor(() => {
        expect(result.data.value?.count).toBe(99);
      });

      expect(fetcher).toHaveBeenCalledOnce();
      expect(result.data.value?.items).toEqual(["from-server"]);
    });

    it("should deduplicate fetcher calls when multiple components mount with same key", async () => {
      const key = uniqueKey();

      const fetcher = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { count: 888, items: ["vue-shared"] } satisfies TestState;
      });

      let res1!: ComposableResult<TestState>;
      let res2!: ComposableResult<TestState>;

      const DualComponent = defineComponent({
        setup() {
          res1 = useSync<TestState>(key, { fetcher }) as ComposableResult<TestState>;
          res2 = useSync<TestState>(key, { fetcher }) as ComposableResult<TestState>;
          return () => null;
        },
      });

      mount(DualComponent, {
        global: {
          plugins: [createSyncraft()],
        },
      });

      await waitFor(() => {
        expect(res1.data.value?.count).toBe(888);
        expect(res2.data.value?.count).toBe(888);
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe("Optimistic Updates", () => {
    it("should update state optimistically via Immer draft", async () => {
      const key = uniqueKey();

      const { result } = mountComposable<TestState>(key, {
        initialState: INITIAL_STATE,
      });

      // Wait for hydration
      await waitFor(() => {
        expect(result.isHydrating.value).toBe(false);
      });

      // Perform update
      result.update((draft) => {
        draft.count = 7;
        draft.items.push("new-item");
      });

      // Wait for update to reflect in reactive state
      await waitFor(() => {
        expect(result.data.value?.count).toBe(7);
      });

      expect(result.data.value?.items).toEqual(["new-item"]);
    });

    it("should expose error in error ref when update fails without throwing", async () => {
      const key = uniqueKey();

      const { result } = mountComposable<TestState>(key, {
        initialState: INITIAL_STATE,
        maxOutboxSize: 1,
        overflowStrategy: "reject",
      });

      await waitFor(() => {
        expect(result.isHydrating.value).toBe(false);
      });

      result.update((d) => {
        d.count = 1;
      });

      await waitFor(() => {
        expect(result.data.value?.count).toBe(1);
      });

      result.update((d) => {
        d.count = 2;
      });

      await waitFor(() => {
        expect(result.error.value).not.toBeNull();
      });

      expect(result.error.value).toBeInstanceOf(SyncraftError);
      expect((result.error.value as SyncraftError).source).toBe("store");
    });
  });

  describe("Error Contract & Refetch", () => {
    it("refetch rethrows on failure and sets error ref", async () => {
      const key = uniqueKey();
      const failingFetcher = vi.fn().mockRejectedValue(new Error("Vue Network Error"));

      const { result } = mountComposable<TestState>(key, {
        initialState: INITIAL_STATE,
        fetcher: failingFetcher,
      });

      await waitFor(() => {
        expect(result.isHydrating.value).toBe(false);
      });

      await expect(result.refetch()).rejects.toThrow("Vue Network Error");
      expect(result.error.value?.message).toContain("Vue Network Error");
      expect((result.error.value as SyncraftError).source).toBe("fetch");
    });

    it("successful sync does not clear unrelated fetch error", async () => {
      const key = uniqueKey();
      const pusher = vi.fn().mockResolvedValue(undefined);
      const failingFetcher = vi.fn().mockRejectedValue(new Error("Vue Fetch Error"));

      const { result } = mountComposable<TestState>(key, {
        initialState: INITIAL_STATE,
        fetcher: failingFetcher,
        pusher,
        syncInterval: 50,
      });

      await waitFor(() => {
        expect(result.isHydrating.value).toBe(false);
      });

      await expect(result.refetch()).rejects.toThrow("Vue Fetch Error");
      expect(result.error.value?.message).toContain("Vue Fetch Error");

      result.update((d) => {
        d.count = 100;
      });

      await waitFor(() => {
        expect(pusher).toHaveBeenCalled();
      });

      // Fetch error remains intact
      expect(result.error.value?.message).toContain("Vue Fetch Error");
    });
  });
});
