import { describe, it, expect, vi } from "vitest";
import { isQuotaExceededError } from "../storage/quota.js";
import { withQuotaGuard, type QuotaExceededInfo } from "../storage/withQuotaGuard.js";
import { SyncraftError } from "../errors.js";
import { createSyncStore } from "../store/index.js";
import * as storage from "../storage.js";

describe("Storage Quota Handling", () => {
  describe("isQuotaExceededError", () => {
    it("identifies standard DOMException with QuotaExceededError name (Chrome/Safari)", () => {
      const domError = new DOMException("The quota has been exceeded", "QuotaExceededError");
      expect(isQuotaExceededError(domError)).toBe(true);
    });

    it("identifies legacy Firefox NS_ERROR_DOM_QUOTA_REACHED name", () => {
      const firefoxError = new DOMException("Quota reached", "NS_ERROR_DOM_QUOTA_REACHED");
      expect(isQuotaExceededError(firefoxError)).toBe(true);
    });

    it("identifies legacy Safari DOMException with code 22", () => {
      const legacyError = {
        name: "UnknownError",
        code: 22,
        message: "Quota exceeded",
      };
      expect(isQuotaExceededError(legacyError)).toBe(true);
    });

    it("identifies duck-typed quota errors in mock/SSR environments", () => {
      expect(isQuotaExceededError({ name: "QuotaExceededError" })).toBe(true);
      expect(isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
      expect(isQuotaExceededError({ code: 22 })).toBe(true);
      expect(isQuotaExceededError({ number: -2147024882 })).toBe(true);
    });

    it("returns false for non-quota errors and non-objects", () => {
      expect(isQuotaExceededError(new DOMException("Not found", "NotFoundError"))).toBe(false);
      expect(isQuotaExceededError(new DOMException("Aborted", "AbortError"))).toBe(false);
      expect(isQuotaExceededError(new Error("Regular Error"))).toBe(false);
      expect(isQuotaExceededError(new TypeError("Invalid argument"))).toBe(false);
      expect(isQuotaExceededError(null)).toBe(false);
      expect(isQuotaExceededError(undefined)).toBe(false);
      expect(isQuotaExceededError("QuotaExceededError")).toBe(false);
      expect(isQuotaExceededError(123)).toBe(false);
    });
  });

  describe("withQuotaGuard", () => {
    const info: QuotaExceededInfo = {
      storageKey: "test-quota-store",
      operation: "writeState",
    };

    it("returns operation result on success", async () => {
      const result = await withQuotaGuard(async () => 42, info);
      expect(result).toBe(42);
    });

    it("rethrows non-quota errors unmodified", async () => {
      const nonQuotaErr = new Error("Database closed");
      await expect(
        withQuotaGuard(async () => {
          throw nonQuotaErr;
        }, info),
      ).rejects.toThrow(nonQuotaErr);
    });

    it("invokes handler and wraps QuotaExceededError in SyncraftError", async () => {
      const handler = vi.fn();
      const quotaErr = new DOMException("Quota exceeded", "QuotaExceededError");

      await expect(
        withQuotaGuard(
          async () => {
            throw quotaErr;
          },
          info,
          handler,
        ),
      ).rejects.toThrow(SyncraftError);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(info);

      try {
        await withQuotaGuard(
          async () => {
            throw quotaErr;
          },
          info,
          handler,
        );
      } catch (err) {
        expect(err).toBeInstanceOf(SyncraftError);
        const syncraftErr = err as SyncraftError;
        expect(syncraftErr.source).toBe("store");
        expect(syncraftErr.retryable).toBe(false);
        expect(syncraftErr.cause).toBe(quotaErr);
        expect(syncraftErr.message).toContain('IndexedDB quota exceeded during "writeState"');
      }
    });

    it("wraps QuotaExceededError even when no handler is provided", async () => {
      const quotaErr = new DOMException("Quota exceeded", "QuotaExceededError");

      await expect(
        withQuotaGuard(async () => {
          throw quotaErr;
        }, info),
      ).rejects.toThrow(SyncraftError);
    });

    it("does not fail if onQuotaExceeded handler itself throws", async () => {
      const failingHandler = vi.fn(() => {
        throw new Error("Handler failed");
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const quotaErr = new DOMException("Quota exceeded", "QuotaExceededError");

      await expect(
        withQuotaGuard(
          async () => {
            throw quotaErr;
          },
          info,
          failingHandler,
        ),
      ).rejects.toThrow(SyncraftError);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error inside onQuotaExceeded handler for "test-quota-store"'),
        expect.any(Error),
      );

      warnSpy.mockRestore();
    });
  });

  describe("Store integration", () => {
    it("invokes onQuotaExceeded callback and rolls back optimistic state when IDB write exceeds quota", async () => {
      const onQuotaExceeded = vi.fn();
      const key = "store-quota-test-key";

      const store = createSyncStore<{ count: number }>({
        storageKey: key,
        initialState: { count: 0 },
        onQuotaExceeded,
      });

      await store.hydrate();

      const writeStateSpy = vi
        .spyOn(storage, "writeState")
        .mockRejectedValueOnce(new DOMException("Disk full", "QuotaExceededError"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        store.set((draft) => {
          draft.count = 100;
        }),
      ).rejects.toThrow(SyncraftError);

      expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
      expect(onQuotaExceeded).toHaveBeenCalledWith({
        storageKey: key,
        operation: "writeState",
      });

      // Rollback verified
      expect(store.getSnapshot()).toEqual({ count: 0 });

      writeStateSpy.mockRestore();
      consoleSpy.mockRestore();
      store.destroy();
    });
  });
});
