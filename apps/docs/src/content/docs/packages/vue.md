---
title: "@syncraft-labs/vue"
description: Vue 3 composables for Syncraft Labs. Add local-first state synchronization, offline persistence, and optimistic updates to your Vue apps using useSync.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft vue, vue local-first, useSync composable, vue offline state, vue optimistic updates, createSyncraft
---

`@syncraft-labs/vue` provides the `useSync` composable — giving your Vue 3 components instant writes, IndexedDB persistence, background sync, and offline support.

Built with `shallowRef` to avoid unnecessary deep reactivity overhead on proxy-managed state snapshots.

## Install

```bash
npm install @syncraft-labs/core @syncraft-labs/vue
```

**Peer dependencies:** Vue ≥ 3.3.0

## Quick Start

Initialize the `createSyncraft()` plugin in your main entry file (required for app-level Store Registry isolation in Nuxt/SSR):

```ts
// main.ts
import { createApp } from 'vue'
import { createSyncraft } from '@syncraft-labs/vue'
import App from './App.vue'

const app = createApp(App)
app.use(createSyncraft())
app.mount('#app')
```

```vue
<!-- App.vue -->
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

---

## API Reference

### `createSyncraft()`

Vue plugin function that sets up the store registry via Vue's `provide` mechanism.

```ts
import { createSyncraft } from '@syncraft-labs/vue';

app.use(createSyncraft());
```

### `useSync<T>(key, options): UseSyncReturn<T>`

Primary composable for Syncraft Labs in Vue.

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

All reactive values are returned as Vue Refs:

| Property | Type | Description |
|----------|------|-------------|
| `data` | `ShallowRef<T \| undefined>` | Current state (`undefined` during hydration) |
| `update` | `(updater: DraftUpdater<T>) => void` | Mutate state with draft (fire-and-forget) |
| `refetch` | `() => Promise<void>` | Pull fresh data via `fetcher` |
| `isHydrating` | `Ref<boolean>` | `true` while loading from IndexedDB |
| `isSyncing` | `Ref<boolean>` | `true` while pusher/refetch is running |
| `isOffline` | `Ref<boolean>` | `true` when `navigator.onLine` is `false` |
| `error` | `ShallowRef<Error \| null>` | Last error from set/pusher/refetch |
| `destroyStore` | `() => void` | Destroy the store for this key |

### `destroyStore(registry, key): void`

Destroy a store and remove it from the specified registry.
