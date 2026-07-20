---
title: Vue
description: Vue 3 composables for Syncraft Labs. Add local-first state synchronization, offline persistence, and optimistic updates to your Vue apps using useSync.
keywords:
  - syncraft vue
  - vue local-first
  - useSync composable
  - vue offline state
  - vue optimistic updates
sidebar_position: 2
---

# @syncraft-labs/vue

> Vue 3 composables for Syncraft Labs — local-first state synchronization.

[![npm version](https://img.shields.io/npm/v/@syncraft-labs/vue?color=42b883)](https://www.npmjs.com/package/@syncraft-labs/vue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

`@syncraft-labs/vue` provides the `useSync` composable — a single composable that gives your Vue 3 components instant writes, IndexedDB persistence, background sync, and offline support.

Built with `shallowRef` to avoid unnecessary deep reactivity on Immer-managed objects.

## Install

```bash
npm install @syncraft-labs/core @syncraft-labs/vue
```

**Peer dependencies:** Vue ≥ 3.3.0

## Quick Start

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

const { data, update, isHydrating, isOffline, error } = useSync<TodoState>(
  "todos",
  {
    initialState: { todos: [] },
  },
);

function addTodo() {
  update((draft) => {
    draft.todos.push({
      id: crypto.randomUUID(),
      text: "New todo",
      done: false,
    });
  });
}

function toggleTodo(id: string) {
  update((draft) => {
    const todo = draft.todos.find((t) => t.id === id);
    if (todo) todo.done = !todo.done;
  });
}
</script>

<template>
  <p v-if="isHydrating">Loading from cache…</p>

  <div v-else>
    <p v-if="isOffline">You're offline — changes saved locally</p>
    <p v-if="error">Error: {{ error.message }}</p>

    <button @click="addTodo">Add Todo</button>

    <ul>
      <li v-for="t in data?.todos" :key="t.id">
        <label>
          <input
            type="checkbox"
            :checked="t.done"
            @change="toggleTodo(t.id)"
          />
          {{ t.text }}
        </label>
      </li>
    </ul>
  </div>
</template>
```

## With Remote Sync

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

const { data, update, refetch, isSyncing } = useSync<TodoState>("todos", {
  initialState: { todos: [] },

  // Fetch initial data from server (called once if IndexedDB is empty)
  fetcher: () => fetch("/api/todos").then((r) => r.json()),

  // Push pending mutations in background (automatic, with exponential backoff)
  pusher: async (entries) => {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    });
  },

  // Sync interval in ms (default: 5000)
  syncInterval: 3000,
});
</script>

<template>
  <button @click="refetch" :disabled="isSyncing">
    {{ isSyncing ? "Syncing…" : "Refresh" }}
  </button>
</template>
```

## API

### `useSync<T>(key, options): UseSyncReturn<T>`

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique IndexedDB storage key |
| `options` | `UseSyncOptions<T>` | Configuration object |

#### `UseSyncOptions<T>`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `initialState` | `T` | `undefined` | Default state when IndexedDB is empty |
| `fetcher` | `() => Promise<T>` | `undefined` | Fetch initial data from remote source |
| `pusher` | `(entries: OutboxEntry<T>[]) => Promise<void>` | `undefined` | Push pending mutations to server |
| `syncInterval` | `number` | `5000` | Background sync interval (ms) |

#### `UseSyncReturn<T>`

All reactive values are wrapped in Vue refs:

| Property | Type | Description |
|----------|------|-------------|
| `data` | `ShallowRef<T \| undefined>` | Current state (`undefined` during hydration) |
| `update` | `(updater: DraftUpdater<T>) => void` | Mutate state with Immer draft (fire-and-forget) |
| `refetch` | `() => Promise<void>` | Pull fresh data via `fetcher` |
| `isHydrating` | `Ref<boolean>` | `true` while loading from IndexedDB |
| `isSyncing` | `Ref<boolean>` | `true` while pusher/refetch is running |
| `isOffline` | `Ref<boolean>` | `true` when `navigator.onLine` is `false` |
| `error` | `ShallowRef<Error \| null>` | Last error from set/pusher/refetch |
| `destroyStore` | `() => void` | Destroy the singleton store for this key |

### `destroyStore(key: string): void`

Destroy a store and remove it from the singleton registry. Closes the IndexedDB connection and clears all listeners.

## Key Behaviors

### Singleton Stores

Multiple components calling `useSync("todos")` share the **same store instance**. This ensures:
- Consistent state across the component tree
- Single IndexedDB connection per key
- Shared outbox queue

### Why `shallowRef`?

Syncraft Labs uses `shallowRef` instead of `ref` for `data` because:
- Immer already manages immutability — each `update()` produces a new object reference
- `shallowRef` triggers Vue reactivity on reference change (which Immer guarantees)
- Deep reactivity (`ref`) would add unnecessary overhead proxying the entire state tree

### Optimistic Updates

`update()` modifies the UI **instantly**. The change persists to IndexedDB in the background. If persistence fails, the update is automatically rolled back.

### Background Sync

When `pusher` is provided, a background loop runs every `syncInterval` ms:
1. Reads pending outbox entries
2. Calls `pusher(entries)`
3. Clears synced entries from outbox
4. On failure: exponential backoff (1s → 2s → 4s → … → 60s max)
5. On reconnect: immediate sync attempt

### Lifecycle

- **`onMounted`**: Hydrates from IndexedDB, starts sync loop, attaches network listeners
- **`onUnmounted`**: Unsubscribes, clears timers, removes network listeners

## License

[MIT](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE) © Denis Listiadi
