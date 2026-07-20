---
title: Sync Strategies
description: Design synchronization strategies for Syncraft Labs — server-side pusher endpoints, conflict resolution, outbox entry anatomy, auth token injection, and custom sync intervals.
keywords:
  - syncraft sync strategy
  - local-first sync
  - pusher endpoint design
  - conflict resolution offline
  - outbox patches
  - offline-first sync
sidebar_position: 5
---

# Sync Strategies

Syncraft Labs handles the client side of synchronization — queueing mutations in an outbox and draining them via your `pusher`. This guide covers how to design the **server side** and choose the right strategy for your use case.

---

## Outbox Entry Anatomy

Every `update()` call produces an `OutboxEntry<T>` stored in IndexedDB:

```ts
interface OutboxEntry<T> {
  id: string;           // UUID — unique per mutation
  timestamp: number;    // Unix ms — when the mutation was created
  patches: Patch[];     // Immer patches — what changed
  inversePatches: Patch[];  // Immer inverse patches — how to undo
  snapshot: T;          // Full state AFTER the mutation
}
```

### When to Use What

| Field | Use Case |
|-------|----------|
| `snapshot` | **Simplest** — just replace server state with the latest snapshot |
| `patches` | **Granular** — apply individual changes for operational transforms |
| `inversePatches` | **Undo** — server-side rollback if the mutation is rejected |
| `timestamp` | **Ordering** — resolve conflicts by time |
| `id` | **Idempotency** — prevent duplicate processing |

---

## Strategy 1: Last-Write-Wins (Snapshot)

The simplest approach — send the latest snapshot to the server and overwrite:

### Client

```tsx
const { data, update } = useSync<TodoState>("todos", {
  initialState: { todos: [] },
  fetcher: () => fetch("/api/todos").then((r) => r.json()),
  pusher: async (entries) => {
    // Send only the latest snapshot (last entry has the most recent state)
    const latest = entries[entries.length - 1];
    await fetch("/api/todos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: latest.snapshot,
        clientTimestamp: latest.timestamp,
        entryIds: entries.map((e) => e.id), // for idempotency
      }),
    });
  },
});
```

### Server (Express Example)

```ts
app.put("/api/todos", async (req, res) => {
  const { state, clientTimestamp, entryIds } = req.body;

  // Idempotency check — skip if already processed
  const alreadyProcessed = await db.checkProcessedEntries(entryIds);
  if (alreadyProcessed) {
    return res.status(200).json({ status: "already_synced" });
  }

  // Last-write-wins — just save the state
  await db.upsertState(req.user.id, "todos", state, clientTimestamp);

  // Mark entries as processed
  await db.markProcessed(entryIds);

  res.status(200).json({ status: "synced" });
});
```

**Pros:** Simple, predictable, works for most apps.  
**Cons:** Concurrent edits from multiple devices — last one wins, earlier changes lost.

---

## Strategy 2: Patch-Based Merge

Use Immer patches for granular conflict resolution:

### Client

```tsx
pusher: async (entries) => {
  await fetch("/api/todos/patches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patches: entries.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        patches: e.patches,
        inversePatches: e.inversePatches,
      })),
    }),
  });
},
```

### Server

```ts
import { applyPatches, enablePatches } from "immer";

enablePatches();

app.post("/api/todos/patches", async (req, res) => {
  const { patches } = req.body;

  // Load current server state
  let serverState = await db.getState(req.user.id, "todos");

  // Apply patches in order
  for (const entry of patches) {
    // Check for conflicts
    try {
      serverState = applyPatches(serverState, entry.patches);
    } catch (error) {
      // Patch conflict — log and skip, or reject
      console.warn(`Patch ${entry.id} conflict:`, error);
      // Option A: Skip conflicting patch
      continue;
      // Option B: Reject and let client refetch
      // return res.status(409).json({ status: "conflict", entryId: entry.id });
    }
  }

  await db.saveState(req.user.id, "todos", serverState);
  res.status(200).json({ status: "synced" });
});
```

**Pros:** Preserves more granular changes, better merge behavior.  
**Cons:** More complex server logic, patch application can fail on stale state.

---

## Strategy 3: Server-Authoritative Merge

Client sends mutations; server merges and sends back authoritative state:

### Client

```tsx
const { update, refetch } = useSync<TodoState>("todos", {
  initialState: { todos: [] },
  fetcher: () => fetch("/api/todos").then((r) => r.json()),
  pusher: async (entries) => {
    const res = await fetch("/api/todos/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });

    if (res.status === 409) {
      // Server detected conflicts — refetch authoritative state
      await refetch();
      return;
    }

    if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  },
});
```

### Server

```ts
app.post("/api/todos/sync", async (req, res) => {
  const { entries } = req.body;
  const serverState = await db.getState(req.user.id, "todos");

  // Check for conflicts (e.g., server state is newer)
  const latestClientTimestamp = Math.max(...entries.map((e) => e.timestamp));
  const serverTimestamp = await db.getLastModified(req.user.id, "todos");

  if (serverTimestamp > latestClientTimestamp) {
    // Another device already modified this data
    return res.status(409).json({
      status: "conflict",
      serverState,
    });
  }

  // No conflict — apply latest snapshot
  const latest = entries[entries.length - 1];
  await db.saveState(req.user.id, "todos", latest.snapshot);

  res.status(200).json({ status: "synced" });
});
```

**Pros:** Server is always authoritative, prevents data corruption.  
**Cons:** Requires conflict detection logic, client must handle 409 responses.

---

## Auth Token Injection

Every production `fetcher` and `pusher` needs authentication:

```tsx
// hooks/use-auth-sync.ts
import { useSync, type UseSyncOptions, type UseSyncReturn } from "@syncraft-labs/react";
import { useAuth } from "./use-auth";

export function useAuthSync<T extends object>(
  key: string,
  options: UseSyncOptions<T>,
): UseSyncReturn<T> {
  const { getAccessToken } = useAuth();

  return useSync<T>(key, {
    ...options,

    fetcher: options.fetcher
      ? async () => {
          const token = await getAccessToken();
          const res = await fetch("/api/" + key, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 401) {
            // Token expired — trigger refresh
            await refreshToken();
            // Retry once
            const retryRes = await fetch("/api/" + key, {
              headers: { Authorization: `Bearer ${await getAccessToken()}` },
            });
            if (!retryRes.ok) throw new Error("Auth failed");
            return retryRes.json();
          }
          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
          return res.json();
        }
      : undefined,

    pusher: options.pusher
      ? async (entries) => {
          const token = await getAccessToken();
          const res = await fetch("/api/" + key + "/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(entries),
          });
          if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
        }
      : undefined,
  });
}
```

---

## Tuning `syncInterval`

The `syncInterval` controls how often the background sync loop checks the outbox:

| Use Case | Recommended Interval | Rationale |
|----------|---------------------|-----------|
| Real-time collaboration | `1000`–`2000` ms | Fast sync for shared editing |
| E-commerce cart | `2000`–`5000` ms | Balance freshness vs battery |
| User preferences | `30_000`–`60_000` ms | Changes are rare |
| Analytics / telemetry | `60_000`–`300_000` ms | Bulk batching |
| Offline-heavy (field work) | `5000` ms (default) | Sync when possible, don't drain battery |

```tsx
useSync<CartState>("cart", {
  initialState: { items: [] },
  pusher: pushToServer,
  syncInterval: 2000, // Check every 2 seconds
});
```

> **Note:** The sync loop is **paused** when `navigator.onLine` is `false` — it doesn't waste cycles polling during offline mode. When connectivity returns, an immediate sync is triggered.

---

## Idempotency

Each outbox entry has a unique `id` (UUID). Use this on the server to prevent duplicate processing:

```ts
// Server-side middleware
async function ensureIdempotent(req, res, next) {
  const entryIds = req.body.entries?.map((e) => e.id) ?? [];

  for (const id of entryIds) {
    if (await cache.has(`processed:${id}`)) {
      return res.status(200).json({ status: "already_processed" });
    }
  }

  // Process the request
  await next();

  // Mark as processed with a TTL (e.g., 24 hours)
  for (const id of entryIds) {
    await cache.set(`processed:${id}`, true, { ttl: 86400 });
  }
}
```

---

## Choosing a Strategy

| Your App | Recommended Strategy | Why |
|----------|---------------------|-----|
| Single user, single device | Last-Write-Wins | Simplest, no conflicts possible |
| Single user, multiple devices | Server-Authoritative | Prevents stale overwrites |
| Multi-user, collaborative | Patch-Based or CRDT (Phase 2) | Granular merge needed |
| Append-only data (logs, events) | Last-Write-Wins + append | Each entry is unique, no conflicts |

---

## Next Steps

- [Error Handling →](./error-handling.md) — Handle sync failures gracefully
- [Production Checklist →](./production-checklist.md) — Pre-deployment checks
- [Testing →](./testing.md) — Test your sync flow
