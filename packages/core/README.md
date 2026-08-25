# <p align="center">@syncraft-labs/core</p>

**<p align="center">The framework-agnostic engine for local-first state synchronization.</p>**

<p align="center">
  <a href="https://www.npmjs.com/package/@syncraft-labs/core"><img src="https://img.shields.io/npm/v/@syncraft-labs/core?style=flat-square&color=brightgreen" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/@syncraft-labs/core"><img src="https://img.shields.io/bundlephobia/minzip/@syncraft-labs/core?style=flat-square" alt="size"></a>
  <a href="https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue.svg?style=flat-square" alt="TypeScript"></a>
</p>

---

## Purpose

`@syncraft-labs/core` is the zero-dependency state engine behind Syncraft Labs. It provides a type-safe, framework-agnostic store that combines **in-memory caching** for instant reads, **IndexedDB** for durable persistence, a **custom proxy draft engine** for zero-overhead immutable updates, and an **outbox queue** for eventual background synchronization.

Whether you're building a web app or a PWA, Syncraft guarantees that your UI is never blocked by network latency while seamlessly synchronizing data when connectivity is restored.

## Installation

```bash
# npm
npm install @syncraft-labs/core

# yarn
yarn add @syncraft-labs/core

# pnpm
pnpm add @syncraft-labs/core
```

## Documentation

The Syncraft Labs documentation is available at **[syncraft-labs.web.id](https://syncraft-labs.web.id)**.

For production and enterprise setups, check out our [Production Guides](https://syncraft-labs.web.id/docs/guides/production-checklist).

## Quick Start

```ts
import { createSyncStore } from "@syncraft-labs/core";

interface AppState {
  count: number;
}

// 1. Create a store for your domain
const store = createSyncStore<AppState>({
  storageKey: "my-counter",
  initialState: { count: 0 },
});

// 2. Hydrate from IndexedDB
await store.hydrate();

// 3. Mutate with proxy drafts — optimistic & durable
await store.set((draft) => {
  draft.count += 1;
});

// 4. Subscribe to changes
const unsubscribe = store.subscribe((newState) => {
  console.log("State updated:", newState.count);
});

// 5. Clean up when done
unsubscribe();
store.destroy();
```

### Storage Modes ("document" vs "collection")
- **`document`** (default): Stores the entire state as a single blob under the key `"current"`. Suited for small-to-medium state.
- **`collection`**: Decomposes state per-entity in IndexedDB. State must be shaped as `Record<string, Entity>`. When updating one entity, only that entity's record is rewritten to IndexedDB rather than the entire state dataset. Requires `idField` in store configuration.

```ts
const store = createSyncStore<Record<string, TodoItem>>({
  storageKey: "todos-collection",
  storageMode: "collection",
  idField: "id",
  initialState: {},
});
```

### Optimistic Updates & Rollback
When you call `store.set()`, the memory state updates instantly, ensuring a zero-latency UI. The state is then persisted to IndexedDB asynchronously. If persistence fails (e.g., due to storage quotas), the memory state automatically rolls back to the previous snapshot and subscribers are notified.

### Cross-Tab Synchronization
Stores with the same `storageKey` automatically synchronize state across multiple browser tabs using `BroadcastChannel`. Changes in one tab reflect instantly in another, without hitting the server.

### State Immutability & Dev-Mode Freezing
To prevent accidental direct mutations that silently desynchronize memory state from IndexedDB (e.g. `state.count++` instead of `store.set(draft => { draft.count++ })`), Syncraft automatically freezes state via `Object.freeze()` in development mode (`NODE_ENV !== "production"`). Direct mutations in dev mode produce an immediate `TypeError`. In production builds, this check is eliminated for zero runtime overhead.

### Supported State Shapes & Type Detection
Syncraft Labs stores state in plain serializable structures. In development mode, `validateStateShape()` automatically guards your state:
- **Plain Objects & Arrays**: Full deep drafting and patch generation support.
- **Primitives**: Numbers, strings, booleans, null, undefined.
- **Dates**: Allowed as immutable leaf values. Must be replaced wholesale (not mutated via `.setFullYear()`, etc.). Emits a dev warning recommending ISO strings or timestamps.
- **Unsupported Types**: Custom class instances, `Map`, `Set`, `RegExp`, `Error`, and functions throw an explicit `Error` with the property path (e.g., `Unsupported type "Map" detected at path "cache.entries"`).

### The Outbox Queue
Every mutation appends an `OutboxEntry` containing patches and inverse patches to IndexedDB. Framework integrations drain this queue using a custom background `pusher` strategy.

## Migrating from Document to Collection Mode

If you are migrating an existing store from `"document"` mode to `"collection"` mode:

1. **Re-shape your state**: Ensure your state type is structured as `Record<string, Entity>` rather than an array or nested document.
2. **Set `storageMode` and `idField`**: Pass `storageMode: "collection"` and `idField: "id"` (or your entity's unique key field) in `SyncStoreConfig`.
3. **Database Migration**: Collection mode uses a dedicated `state_entities` object store. Existing persisted state in `"document"` mode will not be auto-migrated. Clear the existing store or re-hydrate from remote source (`fetcher`).

## API Reference

| Export | Type | Description |
|--------|------|-------------|
| `createSyncStore<T>(config)` | Function | Factory creating a new `SyncStore` instance (`T extends Record<string, unknown> \| any[]`) |
| `deepFreeze<T>(obj)` | Function | Recursively freeze an object tree with `Object.freeze()` |
| `assertNoCycles(obj, context?)` | Function | Detect circular references in an object tree with detailed property path |
| `validateStateShape(obj, context?)` | Function | Recursively validate state shape; warns on Date and throws on unsupported types |
| `isUnsupportedType(val)` | Function | Check if a value is an unsupported type for state drafting/persistence |
| `applyPatches<T>(base, patches)` | Function | Pure function applying Immer JSON patches to a state |
| `compactOutbox(entries)` | Function | Merges redundant consecutive patches to the same path |
| `SyncStoreConfig<T>` | Interface | Configuration options (`storageKey`, `initialState?`, `maxOutboxSize?`, `overflowStrategy?`, `onOverflow?`, `storageMode?`, `idField?`) |
| `OutboxOverflowStrategy` | Type | Strategy enum (`"reject"`, `"dropOldest"`, `"forceFlush"`) |
| `OutboxOverflowInfo` | Interface | Event details (`storageKey`, `outboxSize`, `maxOutboxSize`, `strategy`) |
| `SyncStore<T>` | Interface | Store methods (`get`, `getSnapshot`, `set`, `subscribe`, `hydrate`, `getOutbox`, `compactOutbox`, `clearOutbox`, `destroy`) |
| `OutboxEntry<T>` | Interface | Outbox entry (`id`, `timestamp`, `patches`, `inversePatches`) |
| `DraftUpdater<T>` | Type | Function updating draft state: `(draft: T) => void \| T` |
| `Patch` | Interface | RFC 6902 compatible JSON patch object (`op`, `path`, `value?`) |

## Framework Integrations

While you can use `@syncraft-labs/core` directly in vanilla JavaScript, we provide official bindings for popular frameworks:

- [**React**](https://syncraft-labs.web.id/docs/packages/react): [`@syncraft-labs/react`](https://www.npmjs.com/package/@syncraft-labs/react) — `useSync` and `useSyncSuspense` hooks built on `useSyncExternalStore`.
- [**Vue 3**](https://syncraft-labs.web.id/docs/packages/vue): [`@syncraft-labs/vue`](https://www.npmjs.com/package/@syncraft-labs/vue) — `useSync` composable built with `shallowRef`.

## License

[MIT](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE) © Denis Listiadi

