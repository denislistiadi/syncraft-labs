---
title: Core
description: API Reference for @syncraft-labs/core. The framework-agnostic engine that powers local-first state synchronization.
keywords:
  - syncraft core
  - createSyncStore
  - OutboxEntry
  - syncraft API
sidebar_position: 3
---

# @syncraft-labs/core

The `@syncraft-labs/core` package provides the underlying engine for Syncraft Labs. It is framework-agnostic and can be used in any JavaScript/TypeScript environment.

## API Reference

### `createSyncStore<T>(config): SyncStore<T>`

Create a new store instance. Each store manages one slice of state identified by `storageKey`.

#### Config: `SyncStoreConfig<T>`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `storageKey` | `string` | *required* | Unique key for IndexedDB database name |
| `initialState` | `T` | `undefined` | Default state when no persisted data exists |
| `maxOutboxSize` | `number` | `1000` | Maximum outbox entries before `set()` throws |

#### Returns: `SyncStore<T>`

| Method | Signature | Description |
|--------|-----------|-------------|
| `get()` | `() => Promise<T \| undefined>` | Async read — memory → IndexedDB fallback |
| `getSnapshot()` | `() => T \| undefined` | Synchronous read from memory (fast path) |
| `set(updater)` | `(updater: DraftUpdater<T>) => Promise<void>` | Mutate via Immer draft. Optimistic + durable |
| `subscribe(listener)` | `(listener: SyncListener<T>) => Unsubscribe` | Listen to state changes |
| `hydrate()` | `() => Promise<T \| undefined>` | Load from IndexedDB (call once on init) |
| `getOutbox()` | `() => Promise<readonly OutboxEntry<T>[]>` | Read pending mutations |
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
  readonly patches: Patch[];     // Immer patches (what changed)
  readonly inversePatches: Patch[]; // Undo patches (for rollback)
  readonly snapshot: T;          // Full state after mutation
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
