<div align="center">

# ⚡ Syncraft Labs

**Local-First State Synchronization Engine for React & Vue**

[![npm version](https://img.shields.io/npm/v/@syncraft-labs/core?color=brightgreen&label=core)](https://www.npmjs.com/package/@syncraft-labs/core)
[![npm version](https://img.shields.io/npm/v/@syncraft-labs/react?color=61dafb&label=react)](https://www.npmjs.com/package/@syncraft-labs/react)
[![npm version](https://img.shields.io/npm/v/@syncraft-labs/vue?color=42b883&label=vue)](https://www.npmjs.com/package/@syncraft-labs/vue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

*Write instantly. Persist automatically. Sync eventually.*

</div>

---

## What is Syncraft Labs?

Syncraft Labs is a **local-first state management engine** that gives your app instant writes, offline persistence, and background synchronization — all with a simple hook/composable API.

Your users get **zero-latency updates** that survive page refreshes, network outages, and app restarts. When connectivity returns, pending changes sync automatically in the background.

```
User Action → Immer Draft → Memory (instant) → IndexedDB (durable) → Outbox (sync)
                                    ↓                                       ↓
                              UI re-renders                        Background pusher
                              immediately                          syncs to server
```

## Features

| Feature | Description |
|---------|-------------|
| ⚡ **Instant writes** | Optimistic updates via Immer — UI never waits for persistence |
| 💾 **IndexedDB persistence** | State survives page refresh, tab close, and browser restart |
| 📤 **Outbox sync** | Mutations queued as patches, drained by a background `pusher` |
| 🔄 **Auto-hydration** | Seamless cold-start from IndexedDB with loading states |
| 📶 **Offline-ready** | Works offline, syncs automatically when back online |
| ↩️ **Auto-rollback** | Reverts optimistic updates if IndexedDB write fails |
| 🧊 **Immer drafts** | Mutate state like plain JS — Immer handles immutability |
| 📦 **Tiny footprint** | Tree-shakeable, no unnecessary dependencies |
| 🔒 **Type-safe** | Full TypeScript with strict mode, generics, and JSDoc |
| ⚛️ **React 18+** | `useSyncExternalStore` for tear-free concurrent rendering |
| 💚 **Vue 3.3+** | `shallowRef` composable — no deep reactivity overhead |

## Quick Start

### React

```bash
npm install @syncraft-labs/core @syncraft-labs/react
```

```tsx
import { useSync } from "@syncraft-labs/react";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

function TodoApp() {
  const { data, update, isHydrating, isOffline } = useSync<TodoState>("todos", {
    initialState: { todos: [] },
    fetcher: () => fetch("/api/todos").then((r) => r.json()),
    pusher: (entries) =>
      fetch("/api/sync", {
        method: "POST",
        body: JSON.stringify(entries),
      }),
  });

  if (isHydrating) return <p>Loading…</p>;

  const addTodo = () => {
    update((draft) => {
      draft.todos.push({
        id: crypto.randomUUID(),
        text: "New todo",
        done: false,
      });
    });
  };

  return (
    <div>
      {isOffline && <span>📴 Offline — changes will sync later</span>}
      <button onClick={addTodo}>Add Todo</button>
      <ul>
        {data?.todos.map((t) => (
          <li key={t.id}>{t.text}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Vue

```bash
npm install @syncraft-labs/core @syncraft-labs/vue
```

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

const { data, update, isHydrating, isOffline } = useSync<TodoState>("todos", {
  initialState: { todos: [] },
  fetcher: () => fetch("/api/todos").then((r) => r.json()),
  pusher: (entries) =>
    fetch("/api/sync", {
      method: "POST",
      body: JSON.stringify(entries),
    }),
});

function addTodo() {
  update((draft) => {
    draft.todos.push({
      id: crypto.randomUUID(),
      text: "New todo",
      done: false,
    });
  });
}
</script>

<template>
  <p v-if="isHydrating">Loading…</p>
  <div v-else>
    <span v-if="isOffline">📴 Offline — changes will sync later</span>
    <button @click="addTodo">Add Todo</button>
    <ul>
      <li v-for="t in data?.todos" :key="t.id">{{ t.text }}</li>
    </ul>
  </div>
</template>
```

### Core Only (Framework-agnostic)

```bash
npm install @syncraft-labs/core
```

```ts
import { createSyncStore } from "@syncraft-labs/core";

interface AppState {
  count: number;
}

const store = createSyncStore<AppState>({
  storageKey: "my-counter",
  initialState: { count: 0 },
});

// Hydrate from IndexedDB
await store.hydrate();

// Read state (synchronous after hydration)
console.log(store.getSnapshot()); // { count: 0 }

// Mutate with Immer drafts
await store.set((draft) => {
  draft.count += 1;
});

// Subscribe to changes
store.subscribe((state) => {
  console.log("State changed:", state);
});

// Read outbox (pending mutations for sync)
const pending = await store.getOutbox();

// Clean up
store.destroy();
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Component Layer (React / Vue)                              │
│                                                             │
│  useSync("todos", { fetcher, pusher })                      │
│       │                                                     │
│       ├──▶ useSyncExternalStore / shallowRef                │
│       ├──▶ Auto-hydration (onMount)                         │
│       ├──▶ Background sync loop (pusher)                    │
│       └──▶ Network tracking (online/offline)                │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  Core Layer (@syncraft-labs/core)                                │
│                                                             │
│  createSyncStore<T>({ storageKey, initialState })           │
│       │                                                     │
│       ├──▶ In-memory cache (instant reads)                  │
│       ├──▶ Immer produceWithPatches (immutable mutations)   │
│       ├──▶ Subscriber notifications (sync, immediate)       │
│       └──▶ Optimistic update + rollback on failure          │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  Storage Layer (IndexedDB via idb)                          │
│                                                             │
│  Database: "syncraft-labs_{key}"                                 │
│  ┌──────────────────┐  ┌────────────────────────┐           │
│  │  state store      │  │  outbox store           │           │
│  │  key: "current"   │  │  key: entry.id (UUID)   │           │
│  │  value: T         │  │  value: OutboxEntry<T>   │           │
│  └──────────────────┘  └────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## API Reference

### `@syncraft-labs/core`

| Export | Type | Description |
|--------|------|-------------|
| `createSyncStore<T>(config)` | Function | Create a new SyncStore instance |
| `SyncStoreConfig<T>` | Type | Config: `storageKey`, `initialState?`, `maxOutboxSize?` |
| `SyncStore<T>` | Type | Store interface: `get`, `set`, `getSnapshot`, `subscribe`, `hydrate`, `getOutbox`, `clearOutbox`, `destroy` |
| `OutboxEntry<T>` | Type | Pending mutation: `id`, `timestamp`, `patches`, `inversePatches`, `snapshot` |
| `DraftUpdater<T>` | Type | Immer draft function: `(draft: T) => void \| T` |
| `SyncListener<T>` | Type | Subscriber callback: `(state: T) => void` |
| `Unsubscribe` | Type | Cleanup function: `() => void` |

### `@syncraft-labs/react`

| Export | Type | Description |
|--------|------|-------------|
| `useSync<T>(key, options)` | Hook | Primary React integration |
| `destroyStore(key)` | Function | Destroy a singleton store |
| `UseSyncOptions<T>` | Type | Options: `initialState?`, `fetcher?`, `pusher?`, `syncInterval?` |
| `UseSyncReturn<T>` | Type | Return: `data`, `update`, `refetch`, `isHydrating`, `isSyncing`, `isOffline`, `error`, `destroyStore` |

### `@syncraft-labs/vue`

| Export | Type | Description |
|--------|------|-------------|
| `useSync<T>(key, options)` | Composable | Primary Vue 3 integration |
| `destroyStore(key)` | Function | Destroy a singleton store |
| `UseSyncOptions<T>` | Type | Options: `initialState?`, `fetcher?`, `pusher?`, `syncInterval?` |
| `UseSyncReturn<T>` | Type | Return: `data` (ShallowRef), `update`, `refetch`, `isHydrating` (Ref), `isSyncing` (Ref), `isOffline` (Ref), `error` (ShallowRef), `destroyStore` |

## Packages

| Package | Description | Size |
|---------|-------------|------|
| [`@syncraft-labs/core`](./packages/core) | Framework-agnostic engine + IndexedDB layer | [![core size](https://img.shields.io/bundlephobia/minzip/@syncraft-labs/core?label=gzip)](https://bundlephobia.com/package/@syncraft-labs/core) |
| [`@syncraft-labs/react`](./packages/react) | React hooks (`useSync`) | [![react size](https://img.shields.io/bundlephobia/minzip/@syncraft-labs/react?label=gzip)](https://bundlephobia.com/package/@syncraft-labs/react) |
| [`@syncraft-labs/vue`](./packages/vue) | Vue 3 composables (`useSync`) | [![vue size](https://img.shields.io/bundlephobia/minzip/@syncraft-labs/vue?label=gzip)](https://bundlephobia.com/package/@syncraft-labs/vue) |

## Browser Support

Syncraft Labs requires **IndexedDB** support, which is available in all modern browsers:

| Browser | Version |
|---------|---------|
| Chrome | 24+ |
| Firefox | 16+ |
| Safari | 10+ |
| Edge | 12+ |
| iOS Safari | 10+ |
| Chrome Android | 25+ |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

[MIT](./LICENSE) © Denis Listiadi
