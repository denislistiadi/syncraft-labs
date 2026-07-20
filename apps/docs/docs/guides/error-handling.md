---
title: Error Handling
description: Complete guide to error handling in Syncraft Labs — optimistic rollback, error state monitoring, React Error Boundaries, sync failure recovery, and outbox overflow patterns.
keywords:
  - syncraft error handling
  - optimistic rollback
  - IndexedDB error
  - sync failure retry
  - offline error handling
  - React Error Boundary state
sidebar_position: 4
---

# Error Handling

Syncraft Labs uses an **optimistic update with pessimistic rollback** strategy. This guide explains every error scenario and the patterns to handle them.

---

## The Rollback Flow

When you call `update()`, the following happens:

```
update(draft => { draft.count += 1 })
     │
     ▼
┌─ 1. Immer produces nextState + patches
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

Both `useSync` (React) and `useSync` (Vue) return an `error` field:

### React

```tsx
function DataEditor() {
  const { data, update, error } = useSync<AppState>("editor", opts);

  return (
    <div>
      {/* Error banner — shown when any operation fails */}
      {error && (
        <div role="alert" className="error-banner">
          <strong>Error:</strong> {error.message}
          <button onClick={() => update((d) => d)}>Retry</button>
        </div>
      )}

      {/* Rest of UI */}
      <Editor
        data={data}
        onSave={(content) => update((draft) => { draft.content = content; })}
      />
    </div>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

const { data, update, error } = useSync<AppState>("editor", opts);
</script>

<template>
  <div v-if="error" role="alert" class="error-banner">
    <strong>Error:</strong> {{ error.message }}
  </div>
  <Editor :data="data" @save="(content) => update((d) => { d.content = content; })" />
</template>
```

> **Note:** The `error` is cleared automatically when the next `pusher` or `refetch` succeeds.

---

## React Error Boundaries

For catastrophic errors (e.g., the store throws during render), use a React Error Boundary:

```tsx
// components/SyncErrorBoundary.tsx
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SyncErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Syncraft Labs] Uncaught error:", error, info);
    // Send to your error tracking service
    // errorTracker.captureException(error, { extra: info });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert">
            <h2>Something went wrong</h2>
            <p>{this.state.error?.message}</p>
            <button onClick={() => this.setState({ hasError: false, error: null })}>
              Try Again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

Usage:

```tsx
import { SyncraftProvider } from "@syncraft-labs/react";
import { SyncErrorBoundary } from "./components/SyncErrorBoundary";

export function App() {
  return (
    <SyncraftProvider>
      <SyncErrorBoundary>
        <MyApp />
      </SyncErrorBoundary>
    </SyncraftProvider>
  );
}
```

---

## Sync Failure & Exponential Backoff

When `pusher` fails, the sync loop retries with exponential backoff:

```
Attempt 1: fail → wait 2s
Attempt 2: fail → wait 4s
Attempt 3: fail → wait 8s
Attempt 4: fail → wait 16s
Attempt 5: fail → wait 32s
Attempt 6: fail → wait 60s (max)
Attempt 7+: fail → wait 60s (capped)
```

**On reconnect** (`navigator.onLine` becomes `true`), the backoff counter resets and an immediate sync is triggered.

### Monitoring Sync State

```tsx
function SyncIndicator() {
  const { isSyncing, isOffline, error } = useSync<AppState>("data", opts);

  if (isOffline) return <Badge color="gray">Offline</Badge>;
  if (isSyncing) return <Badge color="blue">Syncing…</Badge>;
  if (error) return <Badge color="red">Sync Error</Badge>;
  return <Badge color="green">Synced</Badge>;
}
```

---

## Outbox Overflow

When the outbox exceeds `maxOutboxSize`, `update()` throws immediately **without** applying the optimistic update:

```tsx
function OfflineEditor() {
  const { update, error } = useSync<DocState>("document", {
    initialState: { content: "" },
    pusher: pushToServer,
    // maxOutboxSize is set at the core level (default: 1000)
  });

  const handleEdit = (content: string) => {
    update((draft) => {
      draft.content = content;
    });
  };

  return (
    <div>
      {error?.message.includes("Outbox size limit") && (
        <div className="warning-bar">
          <p>You have too many unsaved changes.</p>
          <p>Please connect to the internet to sync before making more edits.</p>
        </div>
      )}
      <textarea onChange={(e) => handleEdit(e.target.value)} />
    </div>
  );
}
```

---

## Error Patterns Cheat Sheet

| Scenario | What Happens | User Impact | Your Action |
|----------|-------------|-------------|-------------|
| IndexedDB write fails | State rolls back, `error` set | Brief UI flicker, change lost | Show toast, prompt retry |
| Pusher fails | Outbox retains entries, auto-retry | Data safe locally, not synced | Show sync status indicator |
| Fetcher fails | `error` set, no data loaded | Empty state shown | Show error + retry button |
| Outbox full | `update()` throws, no state change | User can't make changes | Prompt user to connect |
| IndexedDB quota exceeded | Same as write fail | Changes can't persist | Show storage warning |
| Store destroyed | All operations throw | N/A | Create new store instance |

---

## Best Practices

1. **Always render `error`** — Don't ignore the error state. Even a subtle toast is better than silent failure.

2. **Provide a manual retry** — For `fetcher` failures, expose `refetch()` as a button:
   ```tsx
   <button onClick={refetch}>Retry</button>
   ```

3. **Monitor outbox size** — In production, track outbox growth to detect sync problems early.

4. **Log to your error tracker** — Send errors to Sentry, DataDog, etc.:
   ```tsx
   useEffect(() => {
     if (error) {
       errorTracker.captureException(error, {
         tags: { component: "syncraft", store: "orders" },
       });
     }
   }, [error]);
   ```

5. **Don't suppress rollback** — The rollback is there for data integrity. Never try to re-apply the optimistic update after a failure.

---

## Next Steps

- [Production Checklist →](./production-checklist.md) — Full pre-deployment checklist
- [Sync Strategies →](./sync-strategies.md) — Designing resilient pusher endpoints
- [Cross-Tab Sync →](./cross-tab-sync.md) — Error behavior across tabs
