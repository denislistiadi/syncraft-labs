---
title: "@syncraft-labs/react"
description: React hooks for Syncraft Labs. Add local-first state synchronization, offline persistence, and optimistic updates to your React 18+ apps using useSync.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft react, react local-first, useSync hook, react offline state, react optimistic updates, SyncraftProvider, useSyncSuspense
---

`@syncraft-labs/react` provides the `useSync` and `useSyncSuspense` hooks — giving your React components instant writes, IndexedDB persistence, background sync, and offline support.

Built on `useSyncExternalStore` for tear-free concurrent rendering.

## Install

```bash
npm install @syncraft-labs/core @syncraft-labs/react
```

**Peer dependencies:** React ≥ 18.0.0

## Quick Start

Wrap your app with `<SyncraftProvider>` (required for store registry isolation across requests in SSR):

```tsx
import { SyncraftProvider, useSync } from "@syncraft-labs/react";

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

export default function App() {
  return (
    <SyncraftProvider>
      <TodoApp />
    </SyncraftProvider>
  );
}
```

---

## API Reference

### `SyncraftProvider`

Context provider that initializes and scopes the Store Registry for your React component tree. **Required** to prevent cross-request state leakage during SSR.

```tsx
<SyncraftProvider>
  <App />
</SyncraftProvider>
```

### `useSync<T>(key, options): UseSyncReturn<T>`

Standard React hook for subscribing to a SyncStore.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique IndexedDB storage key |
| `options` | `UseSyncOptions<T>` | Configuration object |

#### `UseSyncOptions<T>`

| `initialState` | `T` | `undefined` | Default state when IndexedDB is empty |
| `fetcher` | `() => Promise<T>` | `undefined` | Fetch initial data from remote source |
| `pusher` | `(entries: OutboxEntry<T>[]) => Promise<void>` | `undefined` | Push pending mutations to server |
| `syncInterval` | `number` | `5000` | Background sync interval (ms) |
| `storageMode` | `"document" \| "collection"` | `"document"` | Storage strategy (`"document"` or `"collection"`) |
| `idField` | `string` | `undefined` | Property name of entity ID (required for collection mode) |

#### `UseSyncReturn<T>`

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T \| undefined` | Current state (`undefined` during hydration) |
| `update` | `(updater: DraftUpdater<T>) => void` | Mutate state with draft (fire-and-forget) |
| `refetch` | `() => Promise<void>` | Pull fresh data via `fetcher` |
| `isHydrating` | `boolean` | `true` while loading from IndexedDB |
| `isSyncing` | `boolean` | `true` while pusher/refetch is running |
| `isOffline` | `boolean` | `true` when `navigator.onLine` is `false` |
| `error` | `Error \| null` | Last error from set/pusher/refetch |
| `destroyStore` | `() => void` | Destroy the store for this key |

### `useSyncSuspense<T>(key, options): UseSyncReturn<T>`

React Suspense-compatible version of `useSync`. Suspends component rendering while the store hydrates from IndexedDB or initial `fetcher` is executing.

```tsx
<React.Suspense fallback={<Skeleton />}>
  <TodoAppWithSuspense />
</React.Suspense>
```

### `destroyStore(registry, key): void`

Destroy a store and remove it from the specified registry. Closes IndexedDB connection and clears listeners.
