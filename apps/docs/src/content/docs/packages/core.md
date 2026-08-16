---
title: "@syncraft-labs/core"
description: API Reference for @syncraft-labs/core. The framework-agnostic engine that powers local-first state synchronization.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft core, createSyncStore, OutboxEntry, syncraft API
---

The `@syncraft-labs/core` package provides the underlying engine for Syncraft Labs. It is framework-agnostic and can be used in any JavaScript/TypeScript environment.

## API Reference

### `createSyncStore<T>(config): SyncStore<T>`

Create a new store instance. Each store manages one slice of state identified by `storageKey`.

#### Config: `SyncStoreConfig<T>`

| `storageKey` | `string` | *required* | Unique key for IndexedDB database name |
| `initialState` | `T` | `undefined` | Default state when no persisted data exists |
| `maxOutboxSize` | `number` | `1000` | Maximum outbox entries before overflow strategy triggers |
| `overflowStrategy` | `"reject" \| "dropOldest" \| "forceFlush"` | `"reject"` | Behavior when `maxOutboxSize` is reached: `"reject"` throws Error, `"dropOldest"` drops oldest entry with warning, `"forceFlush"` invokes `onOverflow` callback to attempt sync before write |
| `onOverflow` | `(info: OutboxOverflowInfo) => void \| Promise<void>` | `undefined` | Callback invoked on outbox overflow events |
| `storageMode` | `"document" \| "collection"` | `"document"` | Storage strategy: `"document"` (single blob) or `"collection"` (per-entity records) |
| `idField` | `string` | `undefined` | Required when `storageMode` is `"collection"`. Property name of entity unique ID |

#### Returns: `SyncStore<T>`

| Method | Signature | Description |
|--------|-----------|-------------|
| `get()` | `() => Promise<T \| undefined>` | Async read — memory → IndexedDB fallback |
| `getSnapshot()` | `() => T \| undefined` | Synchronous read from memory (fast path) |
| `set(updater)` | `(updater: DraftUpdater<T>) => Promise<void>` | Mutate via draft. Optimistic + durable |
| `subscribe(listener)` | `(listener: SyncListener<T>) => Unsubscribe` | Listen to state changes |
| `hydrate()` | `() => Promise<T \| undefined>` | Load from IndexedDB (call once on init) |
| `getOutbox()` | `() => Promise<readonly OutboxEntry<T>[]>` | Read pending mutations |
| `compactOutbox()` | `() => Promise<readonly OutboxEntry<T>[]>` | Return compacted view of outbox entries (last-write-wins) |
| `clearOutbox(ids)` | `(ids: readonly string[]) => Promise<void>` | Remove synced entries by ID |
| `destroy()` | `() => void` | Close IndexedDB connection, clear listeners |
| `isHydrating` | `boolean` (getter) | `true` until `hydrate()` completes |

---

### Core Types

#### `DraftUpdater<T>`

```ts
type DraftUpdater<T> = (draft: T) => void | T;
```

Two patterns:
- **Mutate the draft** (most common): `(draft) => { draft.count += 1; }`
- **Replace entirely**: `() => freshDataFromServer`

#### `OutboxEntry<T>`

```ts
interface OutboxEntry<T> {
  readonly id: string;           // UUID v4
  readonly timestamp: number;    // Unix ms
  readonly patches: Patch[];     // Applied JSON patches
  readonly inversePatches: Patch[]; // Inverse patches for rollback
}
```

### Utilities

#### `compactOutbox<T>(entries: readonly OutboxEntry<T>[]): CompactResult<T> | null`

Compact an array of outbox entries by merging consecutive mutations to the same path (last-write-wins). Returns `{ compacted, originalIds }` or `null` if empty.

```ts
import { compactOutbox } from "@syncraft-labs/core";

const result = compactOutbox(outboxEntries);
if (result) {
  await pusher([result.compacted]);
  await store.clearOutbox(result.originalIds);
}
```

#### `applyPatches<T>(baseState: T, patches: readonly Patch[]): T`

Apply an array of Immer-style JSON patches to a base state object. Returns a new state object without mutating the original.

```ts
import { applyPatches } from "@syncraft-labs/core";

const nextState = applyPatches(baseState, entry.patches);
```

#### `Patch`

```ts
interface Patch {
  op: "replace" | "add" | "remove";
  path: (string | number)[];
  value?: unknown;
}
```

#### `SyncListener<T>`

```ts
type SyncListener<T> = (state: T) => void;
```

#### `Unsubscribe`

```ts
type Unsubscribe = () => void;
```
