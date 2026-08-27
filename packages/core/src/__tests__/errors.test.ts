import { describe, it, expect } from "vitest";
import {
  SyncraftError,
  toSyncraftError,
} from "../errors.js";

describe("SyncraftError", () => {
  it("creates an instance with default source 'store' and retryable false", () => {
    const error = new SyncraftError("Something failed");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SyncraftError);
    expect(error.name).toBe("SyncraftError");
    expect(error.message).toBe("Something failed");
    expect(error.source).toBe("store");
    expect(error.retryable).toBe(false);
  });

  it("creates an instance with custom source and retryable flag", () => {
    const original = new Error("Network timeout");
    const error = new SyncraftError(original, {
      source: "sync",
      retryable: true,
    });
    expect(error.message).toBe("Network timeout");
    expect(error.source).toBe("sync");
    expect(error.retryable).toBe(true);
    expect(error.originalError).toBe(original);
  });

  it("normalizes unknown thrown values via toSyncraftError", () => {
    const fromString = toSyncraftError("Quota exceeded", "hydration");
    expect(fromString).toBeInstanceOf(SyncraftError);
    expect(fromString.message).toBe("Quota exceeded");
    expect(fromString.source).toBe("hydration");

    const fromObj = toSyncraftError({ code: 500 }, "fetch");
    expect(fromObj).toBeInstanceOf(SyncraftError);
    expect(fromObj.source).toBe("fetch");

    // Preserves existing SyncraftError instance
    const preserved = toSyncraftError(fromString, "sync");
    expect(preserved).toBe(fromString);
    expect(preserved.source).toBe("hydration");
  });
});
