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

## Core Concepts

### Zero-Dependency Proxy Draft Engine
State updates use a custom, lightweight proxy-based engine (`produceWithPatches`). It captures mutations made directly on the `draft` object and generates JSON-compatible patches and inverse patches without relying on third-party libraries.

### Optimistic Updates & Rollback
When you call `store.set()`, the memory state updates instantly, ensuring a zero-latency UI. The state is then persisted to IndexedDB asynchronously. If persistence fails (e.g., due to storage quotas), the memory state automatically rolls back to the previous snapshot and subscribers are notified.

### Cross-Tab Synchronization
Stores with the same `storageKey` automatically synchronize state across multiple browser tabs using `BroadcastChannel`. Changes in one tab reflect instantly in another, without hitting the server.

### The Outbox Queue
Every mutation appends an `OutboxEntry` containing the state snapshot, patches, and inverse patches to IndexedDB. Framework integrations drain this queue using a custom background `pusher` strategy.

## API Reference

| Export | Type | Description |
|--------|------|-------------|
| `createSyncStore<T>(config)` | Function | Factory creating a new `SyncStore` instance (`T extends Record<string, unknown> \| any[]`) |
| `SyncStoreConfig<T>` | Interface | Configuration options (`storageKey`, `initialState?`, `maxOutboxSize?`) |
| `SyncStore<T>` | Interface | Store methods (`get`, `getSnapshot`, `set`, `subscribe`, `hydrate`, `getOutbox`, `clearOutbox`, `destroy`) |
| `OutboxEntry<T>` | Interface | Outbox entry (`id`, `timestamp`, `patches`, `inversePatches`, `snapshot`) |
| `DraftUpdater<T>` | Type | Function updating draft state: `(draft: T) => void \| T` |
| `Patch` | Interface | RFC 6902 compatible JSON patch object (`op`, `path`, `value?`) |

## Framework Integrations

While you can use `@syncraft-labs/core` directly in vanilla JavaScript, we provide official bindings for popular frameworks:

- [**React**](https://syncraft-labs.web.id/docs/packages/react): [`@syncraft-labs/react`](https://www.npmjs.com/package/@syncraft-labs/react) — `useSync` and `useSyncSuspense` hooks built on `useSyncExternalStore`.
- [**Vue 3**](https://syncraft-labs.web.id/docs/packages/vue): [`@syncraft-labs/vue`](https://www.npmjs.com/package/@syncraft-labs/vue) — `useSync` composable built with `shallowRef`.

## License

[MIT](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE) © Denis Listiadi

