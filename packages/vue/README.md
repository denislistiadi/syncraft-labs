# <p align="center">@syncraft-labs/vue</p>

**<p align="center">The official Vue 3 bindings for Syncraft Labs — local-first state synchronization.</p>**

<p align="center">
  <a href="https://www.npmjs.com/package/@syncraft-labs/vue"><img src="https://img.shields.io/npm/v/@syncraft-labs/vue?style=flat-square&color=42b883" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/@syncraft-labs/vue"><img src="https://img.shields.io/bundlephobia/minzip/@syncraft-labs/vue?style=flat-square" alt="size"></a>
  <a href="https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue.svg?style=flat-square" alt="TypeScript"></a>
</p>

---

## Purpose

`@syncraft-labs/vue` provides the `useSync` composable — a single composable that gives your Vue components instant writes, IndexedDB persistence, background sync, and offline support.

Built with Vue 3's `shallowRef` to safely integrate with Immer-managed objects, preventing unnecessary deep reactivity proxying overhead while keeping your UI instantly synced.

## Installation

```bash
# npm
npm install @syncraft-labs/core @syncraft-labs/vue

# yarn
yarn add @syncraft-labs/core @syncraft-labs/vue

# pnpm
pnpm add @syncraft-labs/core @syncraft-labs/vue
```
*Peer dependencies: Vue ≥ 3.3.0*

## Documentation

The Syncraft Labs documentation is available at **[syncraft-labs.web.id](https://syncraft-labs.web.id)**.

- [Getting Started with Vue](https://syncraft-labs.web.id/docs/packages/vue)
- [SSR with Nuxt 3](https://syncraft-labs.web.id/docs/guides/ssr-nextjs-nuxt)
- [Production Guides](https://syncraft-labs.web.id/docs/guides/production-checklist)

## Basic Usage

Mount the `createSyncraft()` plugin in your root application (crucial for Nuxt SSR isolation), then use the composable anywhere.

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

const { data, update, isHydrating, isOffline, error } = useSync<TodoState>(
  "todos",
  { initialState: { todos: [] } }
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
</script>

<template>
  <p v-if="isHydrating">Loading from cache…</p>

  <div v-else>
    <p v-if="isOffline">You're offline — changes saved locally</p>
    <p v-if="error">Error: {{ error.message }}</p>

    <button @click="addTodo">Add Todo</button>

    <ul>
      <li v-for="t in data?.todos" :key="t.id">
        {{ t.text }}
      </li>
    </ul>
  </div>
</template>
```

## Remote Sync (Background pushing)

Inject your API calls into the `useSync` options. Syncraft will automatically queue mutations offline and push them using an exponential backoff strategy when the user is online.

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

const { data, update, refetch, isSyncing } = useSync<TodoState>("todos", {
  initialState: { todos: [] },

  // Fetch initial data (called once if DB is empty)
  fetcher: () => fetch("/api/todos").then((r) => r.json()),

  // Push pending mutations to your backend
  pusher: async (entries) => {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    });
  },

  // Polling interval in ms (default: 5000)
  syncInterval: 3000,
});
</script>

<template>
  <button @click="refetch" :disabled="isSyncing">
    {{ isSyncing ? "Syncing…" : "Refresh" }}
  </button>
</template>
```

## License

[MIT](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE) © Denis Listiadi
