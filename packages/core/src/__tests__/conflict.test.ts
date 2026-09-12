import { describe, it, expect, vi } from "vitest";
import { resolveConflict } from "../controller/conflict.js";
import { SyncraftError } from "../errors.js";
import type { Patch } from "../produce/types.js";

describe("resolveConflict engine", () => {
  interface DocumentState extends Record<string, unknown> {
    title: string;
    body: string;
    version: number;
  }

  const baseState: DocumentState = {
    title: "Base Title",
    body: "Base Body",
    version: 1,
  };

  const localState: DocumentState = {
    title: "Local Title Edited",
    body: "Base Body",
    version: 1,
  };

  const remoteState: DocumentState = {
    title: "Base Title",
    body: "Remote Body Edited",
    version: 2,
  };

  const samplePatches: readonly Patch[] = [
    { op: "replace", path: ["title"], value: "Local Title Edited" },
  ];

  describe("lastWriteWins strategy", () => {
    it("returns remote authoritative state directly by default", () => {
      const result = resolveConflict(
        localState,
        remoteState,
        baseState,
        samplePatches,
        { strategy: "lastWriteWins" },
      );

      expect(result).toEqual(remoteState);
      expect(result.body).toBe("Remote Body Edited");
    });
  });

  describe("custom resolver strategy", () => {
    it("calls the custom resolver with local, remote, base, and patches", () => {
      const resolverMock = vi.fn(
        ({ local, remote, base }: { local: DocumentState; remote: DocumentState; base: DocumentState; patches: readonly Patch[] }) => {
          return {
            title: local.title !== base.title ? local.title : remote.title,
            body: remote.body !== base.body ? remote.body : local.body,
            version: Math.max(local.version, remote.version) + 1,
          };
        },
      );

      const result = resolveConflict(
        localState,
        remoteState,
        baseState,
        samplePatches,
        { strategy: "custom", resolver: resolverMock },
      );

      expect(resolverMock).toHaveBeenCalledTimes(1);
      expect(resolverMock).toHaveBeenCalledWith({
        local: localState,
        remote: remoteState,
        base: baseState,
        patches: samplePatches,
      });

      expect(result).toEqual({
        title: "Local Title Edited",
        body: "Remote Body Edited",
        version: 3,
      });
    });

    it("throws SyncraftError when strategy is custom but resolver is omitted", () => {
      expect(() =>
        resolveConflict(
          localState,
          remoteState,
          baseState,
          samplePatches,
          { strategy: "custom" },
        ),
      ).toThrow(SyncraftError);

      try {
        resolveConflict(
          localState,
          remoteState,
          baseState,
          samplePatches,
          { strategy: "custom" },
        );
      } catch (err) {
        expect(err).toBeInstanceOf(SyncraftError);
        expect((err as SyncraftError).source).toBe("sync");
        expect((err as SyncraftError).retryable).toBe(false);
      }
    });

    it("wraps any error thrown inside the custom resolver in a SyncraftError", () => {
      const failingResolver = () => {
        throw new TypeError("Cannot read property of undefined in custom merge");
      };

      expect(() =>
        resolveConflict(
          localState,
          remoteState,
          baseState,
          samplePatches,
          { strategy: "custom", resolver: failingResolver },
        ),
      ).toThrow(SyncraftError);

      try {
        resolveConflict(
          localState,
          remoteState,
          baseState,
          samplePatches,
          { strategy: "custom", resolver: failingResolver },
        );
      } catch (err) {
        expect(err).toBeInstanceOf(SyncraftError);
        expect((err as SyncraftError).source).toBe("sync");
        expect((err as SyncraftError).message).toContain("Custom conflict resolver threw an unexpected error");
        expect((err as SyncraftError).cause).toBeInstanceOf(TypeError);
      }
    });
  });
});
