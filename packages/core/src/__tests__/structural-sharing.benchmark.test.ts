import { describe, expect, it } from "vitest";

function createLargeArray(size: number): number[] {
  return Array.from({ length: size }, (_, i) => i);
}

function spreadCopy(arr: number[]): number[] {
  return [...arr];
}

function sliceCopy(arr: number[]): number[] {
  return arr.slice();
}

function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe("structural sharing benchmark", () => {
  it("spread copy 10k array", () => {
    const arr = createLargeArray(10_000);
    const ms = measure(() => spreadCopy(arr));
    console.log(`spread copy 10k: ${ms.toFixed(2)}ms`);
  });

  it("slice copy 10k array", () => {
    const arr = createLargeArray(10_000);
    const ms = measure(() => sliceCopy(arr));
    console.log(`slice copy 10k: ${ms.toFixed(2)}ms`);
  });

  it("spread copy 100k array", () => {
    const arr = createLargeArray(100_000);
    const ms = measure(() => spreadCopy(arr));
    console.log(`spread copy 100k: ${ms.toFixed(2)}ms`);
  });

  it("slice copy 100k array", () => {
    const arr = createLargeArray(100_000);
    const ms = measure(() => sliceCopy(arr));
    console.log(`slice copy 100k: ${ms.toFixed(2)}ms`);
  });

  it("spread copy 1M array", () => {
    const arr = createLargeArray(1_000_000);
    const ms = measure(() => spreadCopy(arr));
    console.log(`spread copy 1M: ${ms.toFixed(2)}ms`);
  });

  it("slice copy 1M array", () => {
    const arr = createLargeArray(1_000_000);
    const ms = measure(() => sliceCopy(arr));
    console.log(`slice copy 1M: ${ms.toFixed(2)}ms`);
  });
});
