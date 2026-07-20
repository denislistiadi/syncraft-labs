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

`@syncraft-labs/core` is the engine behind Syncraft Labs. It provides a type-safe, framework-agnostic store that combines **in-memory caching** for instant reads, **IndexedDB** for offline persistence, and an **outbox queue** for eventual synchronization.

Whether you're building a web app or a PWA, Syncraft guarantees that your UI is never blocked by the network, while seamlessly resolving data when the user comes back online.

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

// 3. Mutate with Immer drafts — optimistic & durable
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

### Optimistic Updates & Rollback
When you call `store.set()`, the memory updates instantly, ensuring a snappy UI. The state is then persisted to IndexedDB asynchronously. If persistence fails (e.g., due to storage quotas), the memory state automatically rolls back to prevent inconsistencies.

### Cross-Tab Synchronization
Stores with the same `storageKey` automatically synchronize state across multiple browser tabs using `BroadcastChannel`. Changes in one tab reflect instantly in another, without hitting the server.

### The Outbox Queue
Every mutation creates an `OutboxEntry` detailing the exact Immer patches used. This queue is safely stored in IndexedDB and can be synced to your backend using a custom `pusher` strategy.

## Framework Integrations

While you can use `@syncraft-labs/core` with vanilla JavaScript, we provide official bindings for popular frameworks:

- [**React**](https://syncraft-labs.web.id/docs/packages/react): [`@syncraft-labs/react`](https://www.npmjs.com/package/@syncraft-labs/react) — `useSync` hook built on `useSyncExternalStore`.
- [**Vue 3**](https://syncraft-labs.web.id/docs/packages/vue): [`@syncraft-labs/vue`](https://www.npmjs.com/package/@syncraft-labs/vue) — `useSync` composable built with `shallowRef`.

## License

[MIT](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE) © Denis Listiadi
