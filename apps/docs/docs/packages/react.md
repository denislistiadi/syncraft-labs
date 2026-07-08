# @syncraft-labs/react

> React hooks for Syncraft Labs — local-first state synchronization.

[![npm version](https://img.shields.io/npm/v/@syncraft-labs/react?color=61dafb)](https://www.npmjs.com/package/@syncraft-labs/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

`@syncraft-labs/react` provides the `useSync` hook — a single hook that gives your React components instant writes, IndexedDB persistence, background sync, and offline support.

Built on `useSyncExternalStore` for tear-free concurrent rendering.

## Install

```bash
npm install @syncraft-labs/core @syncraft-labs/react
```

**Peer dependencies:** React ≥ 18.0.0

## Quick Start

```tsx
import { useSync } from "@syncraft-labs/react";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

function TodoApp() {
  const { data, update, isHydrating, isOffline, error } = useSync<TodoState>(
    "todos",
    {
      initialState: { todos: [] },
    },
  );

  if (isHydrating) return <p>Loading from cache…</p>;

  return (
    <div>
      {isOffline && <p>You're offline — changes saved locally</p>}
      {error && <p>Error: {error.message}</p>}

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
          <li key={t.id}>
            <label>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() =>
                  update((draft) => {
                    const todo = draft.todos.find((x) => x.id === t.id);
                    if (todo) todo.done = !todo.done;
                  })
                }
              />
              {t.text}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## With Remote Sync

```tsx
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

// Pull-to-refresh
<button onClick={() => refetch()} disabled={isSyncing}>
  {isSyncing ? "Syncing…" : "Refresh"}
</button>
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

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T \| undefined` | Current state (`undefined` during hydration) |
| `update` | `(updater: DraftUpdater<T>) => void` | Mutate state with Immer draft (fire-and-forget) |
| `refetch` | `() => Promise<void>` | Pull fresh data via `fetcher` |
| `isHydrating` | `boolean` | `true` while loading from IndexedDB |
| `isSyncing` | `boolean` | `true` while pusher/refetch is running |
| `isOffline` | `boolean` | `true` when `navigator.onLine` is `false` |
| `error` | `Error \| null` | Last error from set/pusher/refetch |
| `destroyStore` | `() => void` | Destroy the singleton store for this key |

### `destroyStore(key: string): void`

Destroy a store and remove it from the singleton registry. Closes the IndexedDB connection and clears all listeners.

## Key Behaviors

### Singleton Stores

Multiple components calling `useSync("todos")` share the **same store instance**. This ensures:
- Consistent state across the component tree
- Single IndexedDB connection per key
- Shared outbox queue

### Optimistic Updates

`update()` modifies the UI **instantly**. The change persists to IndexedDB in the background. If persistence fails, the update is automatically rolled back.

### Background Sync

When `pusher` is provided, a background loop runs every `syncInterval` ms:
1. Reads pending outbox entries
2. Calls `pusher(entries)`
3. Clears synced entries from outbox
4. On failure: exponential backoff (1s → 2s → 4s → … → 60s max)
5. On reconnect: immediate sync attempt

### Network Tracking

`isOffline` automatically tracks `navigator.onLine`. When the device comes back online, the sync loop is triggered immediately (no waiting for the next interval).

## License

[MIT](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE) © Denis Listiadi
