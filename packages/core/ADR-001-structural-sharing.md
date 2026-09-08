# ADR-001: Structural Sharing for Large Arrays

## Status
Accepted

## Context
`markChanged` in `packages/core/src/produce/context.ts` performs a full shallow copy for any array that changes using `[...target]`. For very large arrays (10k+ items), this is expensive because every mutation allocates a new array with all elements, even when only one element changes.

This becomes a performance bottleneck for state trees with large arrays that are frequently mutated.

## Decision
1. **Use `target.slice()` instead of `[...target]`** for array shallow copies. While functionally equivalent, `slice()` is a built-in method optimized by V8 and avoids creating intermediate iterators.

2. **No persistent data structure implementation** at this time. Custom persistent structures (e.g., Ctries or Hash Array Mapped Tries) would add significant complexity and bundle size. The current approach with `slice()` provides acceptable performance for most use cases.

3. **Document "split into collection mode"** as the recommended approach for extremely large arrays (>100k items). Users with massive arrays should consider using `storageMode: "collection"` (see related storage mode issue) to store data per-entity in IndexedDB rather than as a single large array.

## Alternatives Considered

### Custom Persistent Structure
Implementing a persistent vector (e.g., Clojure-style) would provide O(log32 n) copy costs instead of O(n). However, this adds ~500+ lines of complex code, increases bundle size, and introduces new failure modes.

### "Split into Collection Mode" Recommendation
For arrays >100k items, users should split data into entities and use `storageMode: "collection"` with an `idField`. This stores each entity separately in IndexedDB, avoiding the need to copy large arrays entirely.

## Consequences
- **Positive**: `target.slice()` provides measurable performance improvement over `[...target]` for large arrays.
- **Neutral**: No breaking changes. The behavior is identical (shallow copy).
- **Future**: If performance becomes an issue for arrays >100k, implement a custom persistent structure or enhance the collection mode recommendation.

## Benchmark Results
See `packages/core/src/__tests__/structural-sharing.benchmark.test.ts` for benchmark data comparing `[...arr]` vs `arr.slice()` for arrays of various sizes.
