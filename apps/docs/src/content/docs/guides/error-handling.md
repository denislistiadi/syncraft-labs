---
title: Error Handling
description: Complete guide to error handling in Syncraft Labs — optimistic rollback, error state monitoring, React Error Boundaries, sync failure recovery, and outbox overflow patterns.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft error handling, optimistic rollback, IndexedDB error, sync failure retry, offline error handling, React Error Boundary state
---

Syncraft Labs uses an **optimistic update with pessimistic rollback** strategy. This guide explains every error scenario and the patterns to handle them.

---

## The Rollback Flow

When you call `update()`, the following happens:

```
update(draft => { draft.count += 1 })
     │
     ▼
┌─ 1. Produce nextState + patches (proxy)
│
├─ 2. Update memory (instant)           ← UI sees the change HERE
├─ 3. Notify subscribers (re-render)
├─ 4. Broadcast to other tabs
│
├─ 5. Write to IndexedDB  ─── SUCCESS ──▶ Done ✅
│                          │
│                          └── FAILURE ──▶ ROLLBACK ⚠️
│                                           │
│                                           ├─ Revert memory to previous state
│                                           ├─ Re-notify subscribers (re-render)
│                                           └─ Set error state
└─ 6. Append OutboxEntry  ─── FAILURE ──▶ Same rollback
```

**Key insight:** The UI updates **before** IndexedDB confirms the write. If the write fails, the UI reverts back — users see a brief flash of the new state, then it disappears. This is the trade-off for instant writes.

---

## Error Sources

| Source | When | Rollback? | Retry? |
|--------|------|-----------|--------|
| `set()` / `update()` | IndexedDB write fails (quota, corruption) | ✅ Yes | ❌ No (user must retry) |
| `pusher` | Network/server error during sync | ❌ No (state is in IndexedDB) | ✅ Auto (exponential backoff) |
| `fetcher` | Network/server error during initial fetch | ❌ No | ❌ No (call `refetch()`) |
| `hydrate()` | IndexedDB read fails | ❌ No | ❌ No |
| Outbox overflow | `maxOutboxSize` reached | ❌ No (state write prevented) | ❌ No (sync first) |

---

## Monitoring the `error` State

Both `useSync` (React) and `useSync` (Vue) return a reactive `error` object. When any operation fails, `error` is populated. When an operation succeeds, `error` is cleared (`null`).

### React Example

```tsx
function TodoApp() {
  const { data, update, refetch, error } = useSync<TodoState>("todos", opts);

  return (
    <div>
      {error && (
        <div role="alert" className="error-banner">
          <span>{error.message}</span>
          <button onClick={() => refetch()}>Try Again</button>
        </div>
      )}
      {/* UI components */}
    </div>
  );
}
```

### Vue Example

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

const { data, update, refetch, error } = useSync<TodoState>("todos", opts);
</script>

<template>
  <div v-if="error" class="error-banner" role="alert">
    <span>{{ error.message }}</span>
    <button @click="refetch">Try Again</button>
  </div>
</template>
```

---

## Outbox Overflow Handling

If a user works offline for a long time, the outbox might hit `maxOutboxSize` (default: 1000). When full, `set()` throws:

> `[SyncStore] Outbox size limit reached (1000 entries). Sync pending changes before adding more.`

Handle this explicitly:

```tsx
function AddTaskButton({ update }: { update: (fn: any) => void }) {
  const [overflow, setOverflow] = useState(false);

  const handleAdd = () => {
    try {
      update((draft: any) => {
        draft.tasks.push({ id: crypto.randomUUID(), title: "New task" });
      });
      setOverflow(false);
    } catch (err: any) {
      if (err.message?.includes("Outbox size limit")) {
        setOverflow(true);
      }
    }
  };

  return (
    <>
      <button onClick={handleAdd}>Add Task</button>
      {overflow && (
        <p className="warning">
          You have too many unsynced changes. Please go online to sync before adding more.
        </p>
      )}
    </>
  );
}
```

---

## Sync Failure Recovery

When `pusher` fails (e.g., server returned 500 or network timeout):

1. The outbox entries **remain in IndexedDB**.
2. Syncraft Labs starts **exponential backoff**:
   - Delay doubles each attempt: 1s → 2s → 4s → 8s → 16s → 32s → 60s (max)
3. When `navigator.onLine` fires (user comes back online), the backoff timer resets and sync attempts **immediately**.

You can also trigger a manual sync attempt by calling `refetch()`:

```tsx
const { refetch, isSyncing, error } = useSync<State>("key", opts);

// Manual retry button
<button onClick={() => refetch()} disabled={isSyncing}>
  {isSyncing ? "Syncing…" : "Retry Sync"}
</button>
```
