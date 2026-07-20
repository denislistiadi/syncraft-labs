# <p align="center">@syncraft-labs/react</p>

**<p align="center">The official React bindings for Syncraft Labs — local-first state synchronization.</p>**

<p align="center">
  <a href="https://www.npmjs.com/package/@syncraft-labs/react"><img src="https://img.shields.io/npm/v/@syncraft-labs/react?style=flat-square&color=61dafb" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/@syncraft-labs/react"><img src="https://img.shields.io/bundlephobia/minzip/@syncraft-labs/react?style=flat-square" alt="size"></a>
  <a href="https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue.svg?style=flat-square" alt="TypeScript"></a>
</p>

---

## Purpose

`@syncraft-labs/react` provides the `useSync` hook — a single hook that gives your React components instant writes, IndexedDB persistence, background sync, and offline support. 

Built natively on `useSyncExternalStore`, it guarantees tear-free concurrent rendering in React 18+ while maintaining a singleton architecture to prevent data leaks during Server-Side Rendering (SSR).

## Installation

```bash
# npm
npm install @syncraft-labs/core @syncraft-labs/react

# yarn
yarn add @syncraft-labs/core @syncraft-labs/react

# pnpm
pnpm add @syncraft-labs/core @syncraft-labs/react
```
*Peer dependencies: React ≥ 18.0.0*

## Documentation

The Syncraft Labs documentation is available at **[syncraft-labs.web.id](https://syncraft-labs.web.id)**.

- [Getting Started with React](https://syncraft-labs.web.id/docs/packages/react)
- [SSR with Next.js](https://syncraft-labs.web.id/docs/guides/ssr-nextjs-nuxt)
- [Production Guides](https://syncraft-labs.web.id/docs/guides/production-checklist)

## Basic Usage

Wrap your application tree in `<SyncraftProvider>` (crucial for SSR safety), then consume state anywhere with `useSync`.

```tsx
import { useSync } from "@syncraft-labs/react";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

function TodoApp() {
  const { data, update, isHydrating, isOffline, error } = useSync<TodoState>(
    "todos",
    { initialState: { todos: [] } }
  );

  // 1. Wait for IndexedDB hydration
  if (isHydrating) return <p>Loading from cache…</p>;

  // 2. Handle network and errors gracefully
  if (isOffline) console.log("Working offline!");
  if (error) console.error("Mutation failed", error);

  return (
    <div>
      <button
        onClick={() =>
          update((draft) => {
            draft.todos.push({
              id: crypto.randomUUID(),
              text: "New todo",
              done: false,
            });
          })
        }
      >
        Add Todo
      </button>

      <ul>
        {data?.todos.map((t) => (
          <li key={t.id}>{t.text}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Remote Sync (Background pushing)

Inject your API calls into the `useSync` options. Syncraft will automatically queue mutations offline and push them using an exponential backoff strategy when the user is online.

```tsx
const { data, update, refetch, isSyncing } = useSync<TodoState>("todos", {
  initialState: { todos: [] },

  // Fetch initial state (called once if DB is empty)
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
```

## License

[MIT](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE) © Denis Listiadi
