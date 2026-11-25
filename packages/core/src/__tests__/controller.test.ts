import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseStoreController, type BaseControllerOptions } from "../controller/base.js";
import { createSyncStore } from "../store/index.js";
import type { SyncStore } from "../types/store.js";
import type { OutboxAck } from "../types/outbox.js";
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
  let key: string;

  beforeEach(async () => {
    key = `test-controller-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    // The merge base stays server-authoritative; the merged local edit is not
    // marked as synchronized.
    expect(controller.lastSyncedBase).toEqual({
      text: "Server Update",
      count: 100,
    });
  });

  it("keeps the server-confirmed base across consecutive remote updates", async () => {
    const customResolver = vi.fn(
      ({ local, remote, base }: { local: AppState; remote: AppState; base: AppState }) => ({
        text: local.text !== base.text ? local.text : remote.text,
        count: remote.count,
      }),
    );

    controller = new TestStoreController(key, store, {
      conflictStrategy: "custom",
      resolver: customResolver,
    });

    await store.set((draft) => {
      draft.text = "Local Draft";
    });

    await controller.applyRemoteState({ text: "Remote One", count: 1 });
    expect(store.getSnapshot()).toEqual({ text: "Local Draft", count: 1 });
    expect(controller.lastSyncedBase).toEqual({ text: "Remote One", count: 1 });

    await controller.applyRemoteState({ text: "Remote Two", count: 2 });
    expect(store.getSnapshot()).toEqual({ text: "Local Draft", count: 2 });
    expect(controller.lastSyncedBase).toEqual({ text: "Remote Two", count: 2 });

    // Both merges compared local edits against the server base, not against a
    // previously merged snapshot.
    expect(customResolver).toHaveBeenCalledTimes(2);
    expect(customResolver.mock.calls[1]![0].base).toEqual({ text: "Remote One", count: 1 });
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

  describe("push acknowledgements", () => {
    const registerSync = (options: BaseControllerOptions<AppState>): (() => void) => {
      const resolved = { syncInterval: 1_000_000, ...options };
      controller = new TestStoreController(key, store, resolved);
      return controller.registerConsumer(resolved);
    };

    const seedTwoEntries = async (): Promise<[string, string]> => {
      await store.set((draft) => {
        draft.count = 1;
      });
      await store.set((draft) => {
        draft.text = "second";
      });
      const outbox = await store.getOutbox();
      return [outbox[0]!.id, outbox[1]!.id];
    };

    it("clears only acknowledged entries and keeps retry entries", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const [firstId, secondId] = await seedTwoEntries();
      const pusher = vi.fn(async (entries: readonly { id: string }[]): Promise<OutboxAck[]> => [
        { id: entries[0]!.id, status: "applied" },
        { id: entries[1]!.id, status: "retry" },
      ]);
      const release = registerSync({ pusher });
      const baseBefore = controller.lastSyncedBase;

      await controller.runSyncLoop();

      const remaining = await store.getOutbox();
      expect(remaining.map((entry) => entry.id)).toEqual([secondId]);
      expect(firstId).not.toEqual(secondId);
      // A partially acknowledged push must not advance the server base.
      expect(controller.lastSyncedBase).toBe(baseBefore);
      warnSpy.mockRestore();
      release();
    });

    it("treats pushed entries missing from the acknowledgement list as retry", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const [firstId, secondId] = await seedTwoEntries();
      const pusher = vi.fn(async (): Promise<OutboxAck[]> => [
        { id: firstId, status: "applied" },
      ]);
      const release = registerSync({ pusher });

      await controller.runSyncLoop();

      const remaining = await store.getOutbox();
      expect(remaining.map((entry) => entry.id)).toEqual([secondId]);
      warnSpy.mockRestore();
      release();
    });

    it("removes rejected entries and reports them through onPushResult", async () => {
      await store.set((draft) => {
        draft.count = 1;
      });
      const firstId = (await store.getOutbox())[0]!.id;
      const error = { code: "validation_failed", message: "Invalid activity" };
      const onPushResult = vi.fn();
      const pusher = vi.fn(async (): Promise<OutboxAck[]> => [
        { id: firstId, status: "rejected", error },
      ]);
      const release = registerSync({ pusher, onPushResult });

      await controller.runSyncLoop();

      expect(await store.getOutbox()).toHaveLength(0);
      expect(onPushResult).toHaveBeenCalledWith([
        expect.objectContaining({ id: firstId, status: "rejected", error }),
      ]);
      release();
    });

    it("maps a single acknowledgement to every compacted entry", async () => {
      const [firstId, secondId] = await seedTwoEntries();
      const onPushResult = vi.fn();
      const pusher = vi.fn(async (entries: readonly { id: string }[]): Promise<OutboxAck[]> => [
        { id: entries[0]!.id, status: "applied" },
      ]);
      const release = registerSync({ pusher, compaction: "merge", onPushResult });

      await controller.runSyncLoop();

      expect(pusher).toHaveBeenCalledTimes(1);
      expect((pusher.mock.calls[0]![0] as readonly unknown[]).length).toBe(1);
      expect(await store.getOutbox()).toHaveLength(0);
      expect(onPushResult.mock.calls[0]![0].map((ack: OutboxAck) => ack.id)).toEqual([
        firstId,
        secondId,
      ]);
      release();
    });

    it("advances lastSyncedBase once the outbox has drained", async () => {
      const pusher = vi.fn(async (entries: readonly { id: string }[]): Promise<OutboxAck[]> =>
        entries.map((entry) => ({ id: entry.id, status: "applied" as const })),
      );
      const release = registerSync({ pusher });

      await store.set((draft) => {
        draft.count = 7;
      });
      await controller.runSyncLoop();

      expect(await store.getOutbox()).toHaveLength(0);
      expect(controller.lastSyncedBase).toEqual(store.getSnapshot());
      release();
    });

    it("tracks pendingCount across updates and acknowledgements", async () => {
      const pusher = vi.fn(async (entries: readonly { id: string }[]): Promise<OutboxAck[]> =>
        entries.map((entry) => ({ id: entry.id, status: "applied" as const })),
      );
      const release = registerSync({ pusher });
      expect(controller.pendingCount).toBe(0);

      await store.set((draft) => {
        draft.count = 3;
      });
      await vi.waitFor(() => {
        expect(controller.pendingCount).toBe(1);
      });

      await controller.runSyncLoop();
      await vi.waitFor(() => {
        expect(controller.pendingCount).toBe(0);
      });
      release();
    });

    it("treats a void pusher response as applied for backwards compatibility", async () => {
      await seedTwoEntries();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const pusher = vi.fn(async (): Promise<void> => {});
      const release = registerSync({ pusher });

      await controller.runSyncLoop();

      expect(await store.getOutbox()).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no acknowledgements"));
      warnSpy.mockRestore();
      release();
    });
  });
});
