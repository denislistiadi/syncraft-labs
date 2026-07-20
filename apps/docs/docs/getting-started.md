---
title: Getting Started
description: Installation and quick start guide for Syncraft Labs in React, Vue, and vanilla JS.
keywords:
  - syncraft installation
  - syncraft quick start
  - syncraft react
  - syncraft vue
sidebar_position: 2
---

# Getting Started

Syncraft Labs provides official bindings for **React** and **Vue 3**, alongside a framework-agnostic **Core** library.

## React 18+

### Installation

```bash
npm install @syncraft-labs/core @syncraft-labs/react
```

### Quick Start

Wrap your application tree in `<SyncraftProvider>` (crucial for SSR safety), then consume state anywhere with `useSync`.

```tsx
import { SyncraftProvider, useSync } from "@syncraft-labs/react";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

function TodoApp() {
  const { data, update, isHydrating, isOffline } = useSync<TodoState>("todos", {
    initialState: { todos: [] },
    
    // Fetch initial data (called once if IndexedDB is empty)
    fetcher: () => fetch("/api/todos").then((r) => r.json()),
    
    // Push pending mutations to the server automatically
    pusher: (entries) =>
      fetch("/api/sync", {
        method: "POST",
        body: JSON.stringify(entries),
      }),
  });

  if (isHydrating) return <p>Loading from cache…</p>;

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
      {isOffline && <span>Offline — changes will sync later</span>}
      <button onClick={addTodo}>Add Todo</button>
      <ul>
        {data?.todos.map((t) => (
          <li key={t.id}>{t.text}</li>
        ))}
      </ul>
    </div>
  );
}

export function App() {
  return (
    // Isolate state per request to avoid data leaks
    <SyncraftProvider>
      <TodoApp />
    </SyncraftProvider>
  );
}
```

---

## Vue 3.3+

### Installation

```bash
npm install @syncraft-labs/core @syncraft-labs/vue
```

### Quick Start

Mount the `createSyncraft()` plugin in your root application (crucial for Nuxt SSR isolation), then use the composable anywhere.

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
    <span v-if="isOffline">Offline — changes will sync later</span>
    <button @click="addTodo">Add Todo</button>
    <ul>
      <li v-for="t in data?.todos" :key="t.id">{{ t.text }}</li>
    </ul>
  </div>
</template>
```

---

## Core Only (Vanilla JS)

### Installation

```bash
npm install @syncraft-labs/core
```

### Quick Start

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
console.log(store.getSnapshot()); // { count: 0 }

// 3. Mutate with Immer drafts
await store.set((draft) => {
  draft.count += 1;
});

// 4. Subscribe to changes
store.subscribe((state) => {
  console.log("State changed:", state);
});

// 5. Read outbox (pending mutations for sync)
const pending = await store.getOutbox();

// 6. Clean up
store.destroy();
```
