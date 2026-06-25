/**
 * Tests for the `useSync` Vue composable.
 *
 * Uses @vue/test-utils with a wrapper component pattern
 * to test composables inside a real Vue component lifecycle.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, type ShallowRef, type Ref } from "vue";
import { createSyncStore } from "@syncraft/core";
import { useSync, _resetRegistry } from "../index.js";

// ─────────────────────────────────────────────────────────────
// Test State Shape
// ─────────────────────────────────────────────────────────────

interface TestState {
  count: number;
  items: string[];
}

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

function mountComposable<T extends object>(
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

  const wrapper = mount(TestComponent);

  return {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    get result() { return result!; },
    wrapper,
  };
}

// ─────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────

afterEach(() => {
  _resetRegistry();
});

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
  });
});
