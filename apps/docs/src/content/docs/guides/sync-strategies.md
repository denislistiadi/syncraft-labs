---
title: Sync Strategies
description: Design synchronization strategies for Syncraft Labs — server-side pusher endpoints, conflict resolution, outbox entry anatomy, auth token injection, and custom sync intervals.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft sync strategy, local-first sync, pusher endpoint design, conflict resolution offline, outbox patches, offline-first sync
---

Syncraft Labs handles the client side of synchronization — queueing mutations in an outbox and draining them via your `pusher`. This guide covers how to design the **server side** and choose the right strategy for your use case.

---

## Outbox Entry Anatomy

Every `update()` call produces an `OutboxEntry<T>` stored in IndexedDB:

```ts
interface OutboxEntry<T> {
  id: string;           // UUID — unique per mutation
  timestamp: number;    // Unix ms — when the mutation was created
  patches: Patch[];     // Applied patches — what changed
  inversePatches: Patch[];  // Inverse patches — how to undo
  snapshot: T;          // Full state AFTER the mutation
}
```

### When to Use What

| Field | Use Case |
|-------|----------|
| `snapshot` | **Simplest** — replace server state with the latest snapshot |
| `patches` | **Granular** — apply individual changes (add, replace, remove) |
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
      body: JSON.stringify(latest.snapshot),
    });
  },
});
```

### Pros & Cons

- ✅ Simple server logic — no diffing required
- ✅ Guaranteed convergence (server always matches client)
- ❌ Concurrent edits from another device will be overwritten

---

## Strategy 2: Patch Draining (Granular Mutations)

Send all queued outbox entries to the server so it can process each mutation individually:

### Client

```tsx
const { data, update } = useSync<TodoState>("todos", {
  initialState: { todos: [] },
  pusher: async (entries) => {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    });
  },
});
```

### Server (Node / Express Example)

```ts
app.post("/api/sync", async (req, res) => {
  const entries: OutboxEntry<TodoState>[] = req.body;

  for (const entry of entries) {
    // 1. Check idempotency (skip if already processed)
    if (await isProcessed(entry.id)) continue;

    // 2. Apply patches to server DB
    for (const patch of entry.patches) {
      await applyPatchToDatabase(req.userId, patch);
    }

    // 3. Mark entry as processed
    await markProcessed(entry.id);
  }

  res.json({ status: "ok" });
});
```

### Pros & Cons

- ✅ Preserves individual mutation history
- ✅ Enables server-side audit logs
- ✅ Idempotent by design (using `entry.id`)
- ❌ Requires patch handling logic on the server

---

## Idempotency Pattern

Network retries are normal in offline-first apps. A `pusher` call might succeed on the server but fail on the network return. When retried, the server receives the same entries again.

**Prevent duplicate processing using `entry.id`:**

```ts
// Server pseudo-code
async function processOutbox(entries: OutboxEntry<T>[]) {
  const db = await getDB();

  await db.transaction(async (tx) => {
    for (const entry of entries) {
      // Fast check: has this UUID been processed?
      const exists = await tx.processedMutations.find(entry.id);
      if (exists) continue;

      // Apply mutation
      await tx.state.applyPatches(entry.patches);

      // Record UUID (with TTL of 30 days)
      await tx.processedMutations.insert({ id: entry.id, createdAt: new Date() });
    }
  });
}
```

---

## Conflict Resolution Strategies

When multiple clients modify the same data offline, conflicts can occur.

| Conflict Strategy | How it works | Best for |
|-------------------|--------------|----------|
| **Client Wins** | Server accepts whatever client sends | Single-user apps (personal todo, user settings) |
| **Server Wins** | Server rejects outbox if server state changed | Financial transactions, inventory counts |
| **Merge (Field-Level)** | Merge non-overlapping patches | Collaborative documents, forms |
| **CRDT (Phase 2)** | Automatic deterministic merge | Real-time multi-user editing |

---

## Custom Sync Intervals

Control how aggressively Syncraft syncs by setting `syncInterval` (ms):

```tsx
// High frequency — e.g., real-time collaboration
useSync("doc", { pusher: pushFn, syncInterval: 1000 });

// Low frequency — e.g., low-bandwidth mobile app
useSync("notes", { pusher: pushFn, syncInterval: 30_000 });
```

> **Default:** `5000` (5 seconds).
