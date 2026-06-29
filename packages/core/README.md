# @syncraft-labs/core

> Local-first state synchronization engine — framework-agnostic core library.

[![npm version](https://img.shields.io/npm/v/@syncraft-labs/core?color=brightgreen)](https://www.npmjs.com/package/@syncraft-labs/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

`@syncraft-labs/core` is the engine behind Syncraft Labs. It provides a type-safe, framework-agnostic store that combines **in-memory caching** for instant reads, **IndexedDB** for offline persistence, and an **outbox queue** for eventual synchronization.

## Install

```bash
npm install @syncraft-labs/core
```

## Quick Start

```ts
import { createSyncStore } from "@syncraft-labs/core";

interface AppState {
  count: number;
}

const store = createSyncStore<AppState>({
  storageKey: "my-counter",
  initialState: { count: 0 },
});

// 1. Hydrate from IndexedDB
await store.hydrate();

// 2. Read state (synchronous after hydration)
const state = store.getSnapshot(); // { count: 0 }

// 3. Mutate with Immer drafts — instant + durable
await store.set((draft) => {
  draft.count += 1;
});

// 4. Subscribe to changes
const unsubscribe = store.subscribe((newState) => {
  console.log("State:", newState.count);
});

// 5. Clean up when done
unsubscribe();
store.destroy();
```

## API

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

### Types

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

## Data Flow

```
store.set(draft => { draft.count++ })
        │
        ▼
┌─────────────────────────────┐
│  Immer produceWithPatches   │  → nextState, patches, inversePatches
└─────────────────────────────┘
        │
        ├──▶ Update in-memory cache (instant, optimistic)
        ├──▶ Notify all subscribers (triggers UI re-render)
        ├──▶ Write to IndexedDB (durable)
        └──▶ Append OutboxEntry to IndexedDB (for eventual sync)

        ⚠️ If IndexedDB write fails:
        └──▶ Rollback memory + re-notify subscribers
```

## Storage Schema

Each `storageKey` maps to its own IndexedDB database:

```
Database: "syncraft-labs_{storageKey}"
├── state store      (key: "current", value: T)
└── outbox store     (key: entry.id, value: OutboxEntry<T>)
```

## Optimistic Updates & Rollback

When you call `store.set()`:

1. **Memory updates instantly** — the UI sees the change immediately
2. **IndexedDB writes async** — persists for durability
3. **If persistence fails** — memory is rolled back to the previous state, subscribers are re-notified

This ensures the UI is never stuck showing data that isn't actually persisted.

## Framework Integrations

- **React**: [`@syncraft-labs/react`](https://www.npmjs.com/package/@syncraft-labs/react) — `useSync` hook with `useSyncExternalStore`
- **Vue**: [`@syncraft-labs/vue`](https://www.npmjs.com/package/@syncraft-labs/vue) — `useSync` composable with `shallowRef`

## License

[MIT](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE) © Denis Listiadi
