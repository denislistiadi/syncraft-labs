/**
 * @module @syncraft-labs/core/__tests__/compact.test
 *
 * Unit tests for outbox compaction pure function algorithm.
 */

import { describe, it, expect } from "vitest";
import { compactOutbox } from "../compact.js";
import { applyPatches } from "../produce.js";
import type { OutboxEntry } from "../types.js";

describe("compactOutbox", () => {
  it("should return null for empty outbox array", () => {
    expect(compactOutbox([])).toBeNull();
  });

  it("should return single entry unchanged", () => {
    const entry: OutboxEntry<{ count: number }> = {
      id: "e1",
      timestamp: 100,
      patches: [{ op: "replace", path: ["count"], value: 1 }],
      inversePatches: [{ op: "replace", path: ["count"], value: 0 }],
    };

    const result = compactOutbox([entry]);
    expect(result).not.toBeNull();
    expect(result!.compacted).toEqual(entry);
    expect(result!.originalIds).toEqual(["e1"]);
  });

  it("should merge 10 mutations to the same field into 1 outbox entry", () => {
    const entries: OutboxEntry<{ count: number }>[] = Array.from(
      { length: 10 },
      (_, i) => ({
        id: `e${i + 1}`,
        timestamp: 1000 + i * 10,
        patches: [{ op: "replace", path: ["count"], value: i + 1 }],
        inversePatches: [{ op: "replace", path: ["count"], value: i }],
      }),
    );

    const result = compactOutbox(entries);
    expect(result).not.toBeNull();
    expect(result!.originalIds).toHaveLength(10);
    expect(result!.originalIds).toEqual([
      "e1",
      "e2",
      "e3",
      "e4",
      "e5",
      "e6",
      "e7",
      "e8",
      "e9",
      "e10",
    ]);

    const { compacted } = result!;
    expect(compacted.patches).toHaveLength(1);
    expect(compacted.patches[0]).toEqual({
      op: "replace",
      path: ["count"],
      value: 10,
    });

    // Original inverse patch should be from the very first entry (reverting count to 0)
    expect(compacted.inversePatches).toHaveLength(1);
    expect(compacted.inversePatches[0]).toEqual({
      op: "replace",
      path: ["count"],
      value: 0,
    });
    expect(compacted.timestamp).toBe(1090);
  });

  it("should merge mutations across multiple distinct paths", () => {
    type State = { todos: { text: string; done: boolean }[]; title: string };

    const entries: OutboxEntry<State>[] = [
      {
        id: "e1",
        timestamp: 100,
        patches: [{ op: "replace", path: ["todos", 0, "text"], value: "Task A" }],
        inversePatches: [{ op: "replace", path: ["todos", 0, "text"], value: "" }],
      },
      {
        id: "e2",
        timestamp: 200,
        patches: [{ op: "replace", path: ["title"], value: "My List" }],
        inversePatches: [{ op: "replace", path: ["title"], value: "Untitled" }],
      },
      {
        id: "e3",
        timestamp: 300,
        patches: [{ op: "replace", path: ["todos", 0, "text"], value: "Task A (edited)" }],
        inversePatches: [{ op: "replace", path: ["todos", 0, "text"], value: "Task A" }],
      },
      {
        id: "e4",
        timestamp: 400,
        patches: [{ op: "replace", path: ["todos", 0, "done"], value: true }],
        inversePatches: [{ op: "replace", path: ["todos", 0, "done"], value: false }],
      },
    ];

    const result = compactOutbox(entries);
    expect(result).not.toBeNull();
    expect(result!.originalIds).toHaveLength(4);

    const { compacted } = result!;
    expect(compacted.patches).toHaveLength(3);
    expect(compacted.patches).toEqual([
      { op: "replace", path: ["todos", 0, "text"], value: "Task A (edited)" },
      { op: "replace", path: ["title"], value: "My List" },
      { op: "replace", path: ["todos", 0, "done"], value: true },
    ]);

    // Test reversibility with applyPatches
    const baseState: State = {
      todos: [{ text: "", done: false }],
      title: "Untitled",
    };

    const finalState = applyPatches(baseState, compacted.patches);
    expect(finalState).toEqual({
      todos: [{ text: "Task A (edited)", done: true }],
      title: "My List",
    });

    const rolledBackState = applyPatches(finalState, compacted.inversePatches);
    expect(rolledBackState).toEqual(baseState);
  });

  it("should cancel out addition followed by removal on the same path", () => {
    type State = { items: string[] };

    const entries: OutboxEntry<State>[] = [
      {
        id: "e1",
        timestamp: 100,
        patches: [{ op: "add", path: ["items", 0], value: "temp item" }],
        inversePatches: [{ op: "remove", path: ["items", 0] }],
      },
      {
        id: "e2",
        timestamp: 200,
        patches: [{ op: "remove", path: ["items", 0] }],
        inversePatches: [{ op: "add", path: ["items", 0], value: "temp item" }],
      },
    ];

    const result = compactOutbox(entries);
    expect(result).not.toBeNull();
    expect(result!.compacted.patches).toHaveLength(0);
    expect(result!.compacted.inversePatches).toHaveLength(0);
  });

  it("should handle root replacement by discarding prior path patches", () => {
    type State = { count: number; name: string };

    const entries: OutboxEntry<State>[] = [
      {
        id: "e1",
        timestamp: 100,
        patches: [{ op: "replace", path: ["count"], value: 5 }],
        inversePatches: [{ op: "replace", path: ["count"], value: 0 }],
      },
      {
        id: "e2",
        timestamp: 200,
        patches: [
          {
            op: "replace",
            path: [],
            value: { count: 100, name: "Fresh State" },
          },
        ],
        inversePatches: [
          {
            op: "replace",
            path: [],
            value: { count: 5, name: "Old State" },
          },
        ],
      },
    ];

    const result = compactOutbox(entries);
    expect(result).not.toBeNull();
    expect(result!.compacted.patches).toHaveLength(1);
    expect(result!.compacted.patches[0]).toEqual({
      op: "replace",
      path: [],
      value: { count: 100, name: "Fresh State" },
    });
  });
});
