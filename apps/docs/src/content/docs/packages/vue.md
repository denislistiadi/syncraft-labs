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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `initialState` | `T` | `undefined` | Default state when IndexedDB is empty |
| `fetcher` | `() => Promise<T>` | `undefined` | Fetch initial data from remote source |
| `pusher` | `PushHandler<T>` | `undefined` | Push pending mutations. Return one `OutboxAck` per entry so uncommitted entries stay queued |
| `compaction` | `"none" \| "merge"` | `"none"` | Outbox compaction before pushing. `"merge"` is only safe when the server applies the merged entry atomically |
| `onPushResult` | `(results: readonly OutboxAck[]) => void` | `undefined` | Called with normalized acknowledgements after every push |
| `syncInterval` | `number` | `5000` | Background sync interval (ms) |
| `selector` | `(state: T \| undefined) => R` | `undefined` | Extract specific slice to prevent over-rendering |
| `onSyncStart` | `() => void` | `undefined` | Fired when background sync starts |
| `onSyncSuccess` | `() => void` | `undefined` | Fired when background sync succeeds |
| `onSyncError` | `(error: Error) => void` | `undefined` | Fired when background sync fails |
| `onRollback` | `(error: Error, previousState: T \| undefined) => void` | `undefined` | Fired when local persistence fails and optimistic state reverts |
| `onConflictResolved` | `(info: ConflictResolvedInfo) => void` | `undefined` | Fired when incoming remote state is reconciled |
| `logger` | `SyncraftLogger` | `console` | Injectable logger replacing hardcoded console calls |
| `maxOutboxSize` | `number` | `1000` | Maximum outbox entries before overflow strategy triggers |
| `overflowStrategy` | `"reject" \| "dropOldest" \| "forceFlush"` | `"reject"` | Behavior when `maxOutboxSize` is reached |
| `onOverflow` | `(info: OutboxOverflowInfo) => void \| Promise<void>` | `undefined` | Callback invoked on outbox overflow events |
| `storageMode` | `"document" \| "collection"` | `"document"` | Storage strategy (`"document"` or `"collection"`) |
| `idField` | `string` | `undefined` | Property name of entity ID (required for collection mode) |
| `encryptionKey` | `EncryptionKeyInput` | `undefined` | Encrypt state at rest with AES-GCM |
| `retainSyncedEntries` | `boolean` | `false` | Archive acknowledged outbox entries instead of deleting them |
| `schemaVersion` | `number` | `1` | Version of the persisted state shape |
| `migrate` | `(persisted: unknown, fromVersion: number) => T` | `undefined` | Migrate persisted state when `schemaVersion` changes |

#### `UseSyncReturn<T>`

All reactive values are returned as Vue Refs:

| Property | Type | Description |
|----------|------|-------------|
| `data` | `ShallowRef<T \| undefined>` | Current state (`undefined` during hydration) |
| `update` | `(updater: DraftUpdater<T>) => void` | Mutate state with draft (fire-and-forget) |
| `refetch` | `() => Promise<void>` | Pull fresh data via `fetcher` |
| `applyRemoteState` | `(remote: T) => Promise<void>` | Apply server-authoritative state without queueing an outbox entry |
| `isHydrating` | `Ref<boolean>` | `true` while loading from IndexedDB |
| `isSyncing` | `Ref<boolean>` | `true` while pusher/refetch is running |
| `isOffline` | `Ref<boolean>` | `true` when `navigator.onLine` is `false` |
| `pendingCount` | `Ref<number>` | Number of mutations waiting in the outbox |
| `error` | `ShallowRef<Error \| null>` | Last error from set/pusher/refetch |
| `purge` | `() => Promise<void>` | Delete local data and reset the merge base. Use on logout or account switch |
| `destroyStore` | `() => void` | Destroy the store for this key |

### `destroyStore(registry, key): void`

Destroy a store and remove it from the specified registry.
