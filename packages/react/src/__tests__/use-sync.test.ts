/**
 * Tests for the `useSync` React hook.
 *
 * Uses @testing-library/react's renderHook + fake-indexeddb
 * to test the full hydration → update → sync lifecycle.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSyncStore, SyncraftError } from "@syncraft-labs/core";
import { useSync, _resetRegistry, SyncraftProvider } from "../index.js";

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
  return `react-test-${keyCounter}-${Date.now()}`;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("useSync", () => {
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

      // Now use the hook — should read persisted data from IDB
      const { result } = renderHook(
        () => useSync<TestState>(key, { initialState: INITIAL_STATE }),
        { wrapper: SyncraftProvider },
      );

      // Initially hydrating
      expect(result.current.isHydrating).toBe(true);

      // Wait for hydration to complete
      await waitFor(() => {
        expect(result.current.isHydrating).toBe(false);
      });

      // Should have the persisted data
      expect(result.current.data?.count).toBe(42);
      expect(result.current.data?.items).toEqual(["persisted"]);
    });

    it("should use initialState when IndexedDB is empty", async () => {
      const key = uniqueKey();

      const { result } = renderHook(
        () => useSync<TestState>(key, { initialState: INITIAL_STATE }),
        { wrapper: SyncraftProvider },
      );

      await waitFor(() => {
        expect(result.current.isHydrating).toBe(false);
      });

      expect(result.current.data?.count).toBe(0);
      expect(result.current.data?.items).toEqual([]);
    });
  });

  describe("Fetcher", () => {
    it("should call fetcher when store is empty after hydration", async () => {
      const key = uniqueKey();

      const fetcher = vi.fn().mockResolvedValue({
        count: 99,
        items: ["from-server"],
      } satisfies TestState);

      const { result } = renderHook(
        () => useSync<TestState>(key, { fetcher }),
        { wrapper: SyncraftProvider },
      );

      // Wait for hydration + fetch
      await waitFor(() => {
        expect(result.current.data?.count).toBe(99);
      });

      expect(fetcher).toHaveBeenCalledOnce();
      expect(result.current.data?.items).toEqual(["from-server"]);
    });

    it("should NOT call fetcher when store has persisted data", async () => {
      const key = uniqueKey();

      // Pre-populate IDB
      const directStore = createSyncStore<TestState>({
        storageKey: key,
        initialState: { count: 10, items: ["existing"] },
      });
      await directStore.hydrate();
      directStore.destroy();

      const fetcher = vi.fn().mockResolvedValue({
        count: 99,
        items: ["from-server"],
      } satisfies TestState);

      const { result } = renderHook(
        () => useSync<TestState>(key, { fetcher }),
        { wrapper: SyncraftProvider },
      );

      await waitFor(() => {
        expect(result.current.isHydrating).toBe(false);
      });

      // Fetcher should NOT be called — IDB had data
      expect(fetcher).not.toHaveBeenCalled();
      expect(result.current.data?.count).toBe(10);
    });

    it("should deduplicate fetcher calls when multiple components mount with same key", async () => {
      const key = uniqueKey();

      const fetcher = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { count: 777, items: ["shared"] } satisfies TestState;
      });

      const { result } = renderHook(
        () => {
          const comp1 = useSync<TestState>(key, { fetcher });
          const comp2 = useSync<TestState>(key, { fetcher });
          return { comp1, comp2 };
        },
        { wrapper: SyncraftProvider },
      );

      await waitFor(() => {
        expect(result.current.comp1.data?.count).toBe(777);
        expect(result.current.comp2.data?.count).toBe(777);
      });

      // Crucial assertion: exactly 1 fetcher call across both components!
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe("Optimistic Updates", () => {
    it("should update state optimistically via Immer draft", async () => {
      const key = uniqueKey();

      const { result } = renderHook(
        () => useSync<TestState>(key, { initialState: INITIAL_STATE }),
        { wrapper: SyncraftProvider },
      );

      // Wait for hydration
      await waitFor(() => {
        expect(result.current.isHydrating).toBe(false);
      });

      // Perform update
      act(() => {
        result.current.update((draft: TestState) => {
          draft.count = 7;
          draft.items.push("new-item");
        });
      });

      // State should update immediately (optimistic)
      await waitFor(() => {
        expect(result.current.data?.count).toBe(7);
      });

      expect(result.current.data?.items).toEqual(["new-item"]);
    });

    it("should expose error when update fails without throwing", async () => {
      const key = uniqueKey();

      const { result } = renderHook(
        () =>
          useSync<TestState>(key, {
            initialState: INITIAL_STATE,
            maxOutboxSize: 1,
            overflowStrategy: "reject",
          }),
        { wrapper: SyncraftProvider },
      );

      await waitFor(() => {
        expect(result.current.isHydrating).toBe(false);
      });

      // Update once (fills outbox to limit 1)
      act(() => {
        result.current.update((draft) => {
          draft.count = 1;
        });
      });

      await waitFor(() => {
        expect(result.current.data?.count).toBe(1);
      });

      // Update second time (triggers maxOutboxSize overflow reject)
      act(() => {
        result.current.update((draft) => {
          draft.count = 2;
        });
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error).toBeInstanceOf(SyncraftError);
      expect((result.current.error as SyncraftError).source).toBe("store");
    });
  });

  describe("Error Contract & Refetch", () => {
    it("refetch rethrows on failure and sets error state", async () => {
      const key = uniqueKey();

      const failingFetcher = vi
        .fn()
        .mockRejectedValue(new Error("Network error 500"));

      const { result } = renderHook(
        () =>
          useSync<TestState>(key, {
            initialState: INITIAL_STATE,
            fetcher: failingFetcher,
          }),
        { wrapper: SyncraftProvider },
      );

      await waitFor(() => {
        expect(result.current.isHydrating).toBe(false);
      });

      // refetch should throw
      await expect(result.current.refetch()).rejects.toThrow(
        "Network error 500",
      );

      // error state should also be populated
      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.message).toContain("Network error 500");
      expect((result.current.error as SyncraftError).source).toBe("fetch");
    });

    it("successful sync does not clear unrelated fetch error", async () => {
      const key = uniqueKey();

      const pusher = vi.fn().mockResolvedValue(undefined);
      const failingFetcher = vi
        .fn()
        .mockRejectedValue(new Error("Fetch failed"));

      const { result } = renderHook(
        () =>
          useSync<TestState>(key, {
            initialState: INITIAL_STATE,
            fetcher: failingFetcher,
            pusher,
            syncInterval: 50,
          }),
        { wrapper: SyncraftProvider },
      );

      await waitFor(() => {
        expect(result.current.isHydrating).toBe(false);
      });

      // Trigger fetch error
      await expect(result.current.refetch()).rejects.toThrow("Fetch failed");
      expect(result.current.error?.message).toContain("Fetch failed");

      // Mutate state to trigger sync loop
      act(() => {
        result.current.update((d) => {
          d.count = 10;
        });
      });

      // Wait for pusher to succeed
      await waitFor(() => {
        expect(pusher).toHaveBeenCalled();
      });

      // Error from fetch should NOT have been wiped out by successful push!
      expect(result.current.error?.message).toContain("Fetch failed");
    });
  });

  describe("Singleton Registry & Sync Loop Deduplication", () => {
    it("should share the same store instance across hooks with the same key", async () => {
      const key = uniqueKey();

      // Render two hooks within the same Provider tree
      const { result } = renderHook(
        () => {
          const res1 = useSync<TestState>(key, { initialState: INITIAL_STATE });
          const res2 = useSync<TestState>(key, { initialState: INITIAL_STATE });
          return { res1, res2 };
        },
        { wrapper: SyncraftProvider },
      );

      // Wait for both to hydrate
      await waitFor(() => {
        expect(result.current.res1.isHydrating).toBe(false);
      });
      await waitFor(() => {
        expect(result.current.res2.isHydrating).toBe(false);
      });

      // Update via first hook
      act(() => {
        result.current.res1.update((draft: TestState) => {
          draft.count = 123;
        });
      });

      // Both hooks should see the update
      await waitFor(() => {
        expect(result.current.res1.data?.count).toBe(123);
      });
      await waitFor(() => {
        expect(result.current.res2.data?.count).toBe(123);
      });
    });

    it("should run exactly one sync loop across multiple components with same key", async () => {
      const key = uniqueKey();
      const pusher = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(
        () => {
          const res1 = useSync<TestState>(key, {
            initialState: INITIAL_STATE,
            pusher,
            syncInterval: 50,
          });
          const res2 = useSync<TestState>(key, {
            initialState: INITIAL_STATE,
            pusher,
            syncInterval: 50,
          });
          return { res1, res2 };
        },
        { wrapper: SyncraftProvider },
      );

      await waitFor(() => {
        expect(result.current.res1.isHydrating).toBe(false);
        expect(result.current.res2.isHydrating).toBe(false);
      });

      act(() => {
        result.current.res1.update((d) => {
          d.count = 55;
        });
      });

      await waitFor(() => {
        expect(pusher).toHaveBeenCalledTimes(1);
      });
    });
  });
});
