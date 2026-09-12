import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseStoreController } from "../controller/base.js";
import { createSyncStore } from "../store/index.js";
import type { SyncStore } from "../types/store.js";
import { SyncraftError } from "../errors.js";

class TestStoreController<T extends Record<string, unknown>> extends BaseStoreController<T> {
  notifyCount = 0;

  protected override notify(): void {
    this.notifyCount++;
    this.notifyListeners();
  }
}

describe("BaseStoreController integration", () => {
  interface AppState extends Record<string, unknown> {
    text: string;
    count: number;
  }

  let store: SyncStore<AppState>;
  let controller: TestStoreController<AppState>;
  const key = "test-controller-key";

  beforeEach(async () => {
    store = createSyncStore<AppState>({
      storageKey: key,
      initialState: { text: "Initial", count: 0 },
    });
    await store.hydrate();
  });

  afterEach(() => {
    controller?.destroy();
    store?.destroy();
  });

  it("applies remote state directly using lastWriteWins by default", async () => {
    controller = new TestStoreController(key, store, {});

    await controller.applyRemoteState({ text: "From Server", count: 42 });

    expect(store.getSnapshot()).toEqual({ text: "From Server", count: 42 });
    expect(controller.lastSyncedBase).toEqual({ text: "From Server", count: 42 });
  });

  it("applies custom conflict resolution and triggers onConflictResolved callback", async () => {
    const onConflictResolved = vi.fn();
    const customResolver = vi.fn(({ local, remote, base }: { local: AppState; remote: AppState; base: AppState }) => ({
      text: local.text !== base.text ? local.text : remote.text,
      count: remote.count,
    }));

    controller = new TestStoreController(key, store, {
      conflictStrategy: "custom",
      resolver: customResolver,
      onConflictResolved,
    });

    // Make a local edit
    await store.set((draft) => {
      draft.text = "Local Draft";
    });

    // Server sends an updated state
    await controller.applyRemoteState({ text: "Server Update", count: 100 });

    expect(customResolver).toHaveBeenCalledTimes(1);
    expect(onConflictResolved).toHaveBeenCalledWith({
      strategy: "custom",
      storageKey: key,
    });
    expect(store.getSnapshot()).toEqual({
      text: "Local Draft",
      count: 100,
    });
    expect(controller.lastSyncedBase).toEqual({
      text: "Local Draft",
      count: 100,
    });
  });

  it("captures and wraps resolver failures in controller error state", async () => {
    controller = new TestStoreController(key, store, {
      conflictStrategy: "custom",
      resolver: () => {
        throw new Error("Resolver panic");
      },
    });

    await expect(controller.applyRemoteState({ text: "Remote", count: 1 })).rejects.toThrow(SyncraftError);
    expect(controller.error).toBeInstanceOf(SyncraftError);
    expect((controller.error as SyncraftError).source).toBe("sync");
  });
});
