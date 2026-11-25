---
title: Reliable Sync
description: Design a production-grade sync protocol on top of Syncraft Labs - per-entry acknowledgements, idempotent pushes, cursor-based pulls, retry semantics, and server-wins conflict handling.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft reliable sync, outbox acknowledgement, idempotent push, cursor pull, offline-first protocol, server wins conflict, pendingCount
---

Syncraft Labs owns the client half of offline-first: optimistic writes, durable IndexedDB state, and an outbox journal. The other half is a server contract that can survive retries, partial failures, and long offline periods.

This guide describes the protocol Syncraft 0.9 expects. It is the same contract used by AgriTrack Pro in production.

---

## The Sync Loop at a Glance

A correct round trip has four phases, always in this order:

1. **Push** pending outbox entries.
2. **Acknowledge** each entry individually.
3. **Reconcile** local state with the server response (for example, apply the authoritative version returned by the server).
4. **Pull** changes newer than the last cursor - only when the outbox is empty.

Skipping step 2 is what causes lost writes. Skipping the "outbox empty" guard on step 4 is what causes resurrected edits: a pull applied while local mutations are still queued can overwrite them before they are pushed.

:::caution
Push before pull. Pull only when `pendingCount` is `0`.
:::

---

## Per-Entry Acknowledgements

Since 0.9, `pusher` can return one `OutboxAck` per entry:

```ts
type OutboxAckStatus = "applied" | "conflict" | "rejected" | "retry";

interface OutboxAck {
  id: string;              // OutboxEntry.id
  status: OutboxAckStatus;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}
```

| Status | Meaning | Syncraft behaviour |
|--------|---------|--------------------|
| `applied` | The server committed the mutation. | Entry is removed from the outbox. |
| `conflict` | The server refused the mutation because its version is stale. | Entry is removed and reported through `onPushResult`. |
| `rejected` | Permanent refusal (validation, authorization, deleted entity). | Entry is removed and reported through `onPushResult`. |
| `retry` | The server could not commit the mutation right now. | Entry stays queued and the loop backs off exponentially. |

Two safety rules are built in:

- **Missing acknowledgements are `retry`.** A partial response never silently deletes an unconfirmed mutation.
- **`void` is treated as "everything applied"** for backwards compatibility, and logs a warning. Do not rely on it in production.

```ts
const { data, update, pendingCount } = useSync<ActivityState>("activities", {
  initialState: { activities: [] },
  pusher: async (entries) => {
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        mutations: entries.map((entry) => ({
          mutation_id: entry.id,
          patches: entry.patches,
        })),
      }),
    });

    if (!response.ok) {
      // Throwing keeps every entry queued and triggers backoff.
      throw new Error(`Push failed with HTTP ${response.status}`);
    }

    const { results } = await response.json();
    return results;
  },
});
```

---

## Server Contract: Push

The client sends the raw outbox entries. Your server decides what a mutation means, but it must be able to process the same `mutation_id` twice and return the same answer.

### Request

```json
{
  "mutations": [
    {
      "mutation_id": "8f14e45f-ea0a-4c8b-9f2a-6a1f0f2f9d10",
      "entity": "activities",
      "entity_id": "3d0f0b7e-7a1c-4c33-9a7e-2f5c1f6a8b21",
      "base_version": 4,
      "patches": [
        { "op": "replace", "path": ["status"], "value": "completed" }
      ],
      "created_at": 1764000000000
    }
  ]
}
```

`mutation_id` is the outbox entry `id`. It is stable across retries, which makes it the idempotency key.

### Processing rules

1. **One transaction per mutation.** A mutation is applied completely or not at all.
2. **Idempotency first.** If `mutation_id` was already processed, return the stored acknowledgement instead of applying the patches again.
3. **Check the base version.** If `base_version` no longer matches the entity version, do not apply the patch. Return `conflict` with the current server version so the client can pull it.
4. **Validate before writing.** Return `rejected` with a stable `error.code` for permanent failures.
5. **Ordering.** Entries are pushed oldest-first. When two mutations target the same entity, apply them in the order received; reject the second with `conflict` if its `base_version` is stale.
6. **Return one result per mutation.** The response array may be in any order, but every `mutation_id` should appear exactly once.

### Response

```json
{
  "results": [
    {
      "id": "8f14e45f-ea0a-4c8b-9f2a-6a1f0f2f9d10",
      "status": "applied",
      "error": null
    },
    {
      "id": "1c9a3d2b-5f4e-4a6b-8c7d-9e0f1a2b3c4d",
      "status": "conflict",
      "error": {
        "code": "version_conflict",
        "message": "Activity was modified on another device.",
        "retryable": false
      }
    }
  ]
}
```

Return HTTP `200` when the batch was processed, even if individual mutations were rejected. Reserve non-2xx responses for transport or server failures that should retry the whole batch.

:::tip
Store `(mutation_id, result)` with a retention window longer than your maximum offline period. A device that was offline for a month will replay old mutations after it reconnects.
:::

---

## Server Contract: Pull

A pull returns everything that changed after the client's cursor. Use a monotonic server-side sequence - a bigint journal id, not a client timestamp.

```http
GET /api/sync/pull?cursor=1042
```

```json
{
  "changes": [
    {
      "cursor": 1043,
      "entity": "activities",
      "entity_id": "3d0f0b7e-7a1c-4c33-9a7e-2f5c1f6a8b21",
      "operation": "upsert",
      "version": 5,
      "payload": { "id": 91, "status": "completed", "version": 5 }
    }
  ],
  "next_cursor": 1043,
  "has_more": false
}
```

Rules that keep the journal correct:

- **Append one row per committed mutation** inside the same transaction that changes the entity.
- **Never reuse or reorder cursor values.** Clients treat the cursor as opaque.
- **Page the response.** Return `has_more: true` and let the client call again with `next_cursor` until it is `false`.
- **Handle expired cursors.** If `cursor` is older than your retention window, return `reset_required` plus a full snapshot. The client must replace its local state and restart from the new cursor.

On the client, apply the pulled snapshot through `applyRemoteState()` or `refetch()` - never through `update()`. `update()` appends to the outbox, which would echo server data back as a local mutation.

```ts
// Pull only after the outbox has drained.
const pull = async (cursor: number) => {
  const response = await fetch(`/api/sync/pull?cursor=${cursor}`);
  const page = await response.json();

  const nextState = mergeChanges(data, page.changes);
  await applyRemoteState(nextState); // server-authoritative, no outbox entry
  localStorage.setItem("sync:cursor", String(page.next_cursor));

  if (page.has_more) {
    await pull(page.next_cursor);
  }
};
```

---

## Conflict Policy: Server Wins

Server-wins is the simplest policy that still converges: the server is the only writer of record, and clients replay their intent against it.

When the server returns `conflict`:

1. The outbox entry is removed - retrying it would fail forever.
2. `onPushResult` receives the acknowledgement.
3. The client pulls the authoritative entity and shows a notification.

```tsx
const [conflicts, setConflicts] = useState<OutboxAck[]>([]);

useSync<ActivityState>("activities", {
  initialState: { activities: [] },
  pusher: pushActivities,
  onPushResult: (results) => {
    const conflictsThisRound = results.filter(
      (result) => result.status === "conflict" || result.status === "rejected",
    );
    if (conflictsThisRound.length > 0) {
      setConflicts((previous) => [...previous, ...conflictsThisRound]);
    }
  },
});
```

Render the conflict list as a non-blocking banner or toast. Do not silently discard it: from the user's point of view, their edit was accepted locally and then disappeared.

:::note
Persistent conflict notifications require your own table. Syncraft only reports the acknowledgement; it does not store conflict history.
:::

---

## Retry and Backoff

The background loop already handles retry scheduling:

- `retry` acknowledgements keep entries in the outbox and schedule the next attempt with exponential backoff (`1s`, `2s`, `4s`, ... capped at 30s).
- A thrown `pusher` error keeps the whole batch queued and backs off the same way.
- `navigator.onLine === false` pauses the loop without consuming retries.
- A non-retryable `SyncraftError` halts the queue until the next manual `refetch()` or remount.

Your server should distinguish transient from permanent failures:

| Situation | Ack status | Why |
|-----------|------------|-----|
| Database timeout, lock contention | `retry` | The same mutation can succeed later. |
| Stale `base_version` | `conflict` | Retrying cannot fix it; the client must pull. |
| Validation error, forbidden action | `rejected` | Retrying will never succeed. |
| Unknown entity id | `rejected` | The entity was deleted or never existed. |

---

## Compaction

Compaction merges consecutive mutations into a single entry before pushing. It reduces payload size, but it also destroys per-entry idempotency.

- `compaction: "none"` (default) - push every entry. Required when the server acks entries individually.
- `compaction: "merge"` - push one merged entry. Only safe when the server applies the merged entry atomically and the merged entry keeps the original ids for acknowledgement.

If you enable `merge`, the server must return one acknowledgement for the compacted entry and Syncraft fans it out to every original id. A partial response is treated as `retry` for all of them.

---

## Observable Status

Expose the queue state in your UI so "saved" is never a guess:

```tsx
const { pendingCount, isSyncing, isOffline, error } = useSync<ActivityState>(
  "activities",
  options,
);
```

| Signal | Use it for |
|--------|------------|
| `pendingCount` | "3 changes waiting to sync" badge |
| `isSyncing` | Spinner while a push or pull is running |
| `isOffline` | Offline banner |
| `error` | Last transport or store error |
| `onPushResult` | Per-entry conflicts and rejections |

`pendingCount` updates after local writes, acknowledgements, `purge()`, and cross-tab broadcasts, so it stays correct when the user has the app open in two tabs.

---

## Reference Implementation

A complete loop with React:

```tsx
function useActivitySync() {
  const cursorRef = useRef(Number(localStorage.getItem("sync:cursor") ?? 0));

  const sync = useSync<ActivityState>("activities", {
    initialState: { activities: [] },
    pusher: pushActivities,
    onSyncSuccess: () => {
      // Push finished; pull when the outbox is empty.
    },
    onPushResult: reportConflicts,
  });

  useEffect(() => {
    if (sync.pendingCount !== 0 || sync.isSyncing || sync.isOffline) return;

    let cancelled = false;
    void (async () => {
      const page = await fetchChanges(cursorRef.current);
      if (cancelled) return;
      await sync.applyRemoteState(mergeChanges(sync.data, page.changes));
      cursorRef.current = page.next_cursor;
      localStorage.setItem("sync:cursor", String(page.next_cursor));
    })();

    return () => {
      cancelled = true;
    };
  }, [sync.pendingCount, sync.isSyncing, sync.isOffline]);

  return sync;
}
```

The important detail is the guard: the effect only pulls when `pendingCount === 0`. That is the client-side half of the convergence rule.

---

## Production Checklist

- [ ] `pusher` returns `OutboxAck[]`, not `void`.
- [ ] Every mutation has a stable `mutation_id` equal to the outbox entry `id`.
- [ ] The server stores processed mutation ids and replays the original result.
- [ ] Each mutation is applied in a single transaction with its journal row.
- [ ] Pull uses a monotonic cursor and supports `has_more`.
- [ ] Expired cursors return `reset_required` and a full snapshot.
- [ ] The client pulls only when `pendingCount` is `0`.
- [ ] `conflict` and `rejected` surface in the UI instead of disappearing.
- [ ] `retry` stays queued and backs off.
- [ ] Local data is purged on logout and account switch (`purge()`).
- [ ] `schemaVersion` is bumped and `migrate` is provided whenever the persisted shape changes.
