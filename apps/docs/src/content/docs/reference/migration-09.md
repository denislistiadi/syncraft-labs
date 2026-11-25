---
title: Migrating to 0.9
description: Upgrade guide from Syncraft Labs 0.8 to 0.9 - per-entry acknowledgements, compaction defaults, merge base changes, IndexedDB schema v5, schema migrations, purge on logout, and reactive pendingCount.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft migration, 0.8 to 0.9, outbox acknowledgement, breaking changes, indexeddb v5, schemaVersion
---

0.9 makes the outbox tell the truth. Pushes are acknowledged per entry, the merge base only advances when the server has confirmed every mutation, and local data has an explicit lifecycle.

Most apps need three changes: return acknowledgements from `pusher`, stop relying on automatic compaction, and review custom conflict resolvers. Everything else is additive.

---

## Install

```bash
npm install @syncraft-labs/core@beta @syncraft-labs/react@beta @syncraft-labs/vue@beta
```

Pin exact versions if you want to stage the rollout:

```json
{
  "dependencies": {
    "@syncraft-labs/core": "0.9.0-beta.1",
    "@syncraft-labs/react": "0.9.0-beta.1"
  }
}
```

---

## Breaking Changes

### 1. `pusher` should return `OutboxAck[]`

Returning `void` still compiles, but Syncraft logs a warning and treats every pushed entry as applied - including entries the server rejected. That is the failure mode 0.9 exists to remove.

```ts
// Before - any partial failure silently drops mutations
pusher: async (entries) => {
  await fetch("/api/sync", {
    method: "POST",
    body: JSON.stringify(entries),
  });
},
```

```ts
// After - one acknowledgement per entry
pusher: async (entries) => {
  const response = await fetch("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      mutations: entries.map((entry) => ({
        mutation_id: entry.id,
        patches: entry.patches,
      })),
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const { results } = await response.json();
  return results; // OutboxAck[]
},
```

If your server cannot acknowledge individual entries yet, return `applied` for every entry explicitly. At least the intent is visible in code:

```ts
return entries.map((entry) => ({ id: entry.id, status: "applied" as const }));
```

### 2. Automatic compaction is gone

0.8 compacted the outbox before every push. 0.9 defaults to `compaction: "none"`, because merging entries makes per-entry acknowledgement impossible.

If your server already handles a single merged entry atomically, opt back in:

```ts
useSync("activities", {
  compaction: "merge",
  pusher: pushActivities,
});
```

If you were relying on compaction for payload size, prefer acknowledging entries individually and batching on the server instead. Compaction is now an explicit trade-off, not a default.

### 3. `lastSyncedBase` is server-confirmed only

The three-way merge base used to be updated with the merged result, which could include local edits the server had not seen. It now advances only when the outbox is empty after a successful push, and `applyRemoteState()` sets it to the incoming remote state.

Custom resolvers that compared `base` against optimistic local state may need adjustment:

```ts
resolver: ({ local, remote, base }) => {
  // `base` is what the server confirmed, not the last local snapshot.
  return {
    ...remote,
    title: local.title !== base.title ? local.title : remote.title,
  };
},
```

`lastWriteWins` (the default) is unaffected in practice: remote still wins.

### 4. IndexedDB schema v5

The database gains a `meta` object store for the persisted schema version. The upgrade is automatic; existing state and outbox entries are preserved.

Downgrading to 0.8 after the database has been opened at v5 will fail because IndexedDB refuses to open a database with a lower version. If you need to roll back, call `purge()` first or clear the site data.

---

## New APIs to Adopt

### `pendingCount` and `onPushResult`

```tsx
const { pendingCount, isSyncing } = useSync<ActivityState>("activities", {
  initialState: { activities: [] },
  pusher: pushActivities,
  onPushResult: (results) => {
    const failed = results.filter((result) => result.status !== "applied");
    if (failed.length > 0) showSyncWarning(failed);
  },
});
```

`pendingCount` is reactive in React and a `Ref<number>` in Vue. Use it to render "N changes waiting" instead of guessing from `isSyncing`.

### `purge()` on logout

Local data must not survive an account or tenant switch.

```ts
const { purge } = useSync<ActivityState>("activities", options);

async function logout() {
  await purge();
  await fetch("/api/logout", { method: "POST" });
  router.visit("/login");
}
```

`purge()` deletes the IndexedDB database, resets the merge base, and lets the store hydrate again. On the raw store it is also available as `store.purge()` and `purgeSyncDB(storageKey)`.

Scope your `storageKey` per user or tenant as well (`activities:c12:u34`). Purging is the cleanup; scoping prevents one account from ever reading another account's cache.

### `schemaVersion` and `migrate`

Bump `schemaVersion` whenever a release changes the persisted shape:

```ts
useSync("activities", {
  initialState: { activities: [] },
  schemaVersion: 2,
  migrate: (persisted, fromVersion) => {
    if (fromVersion === 1) {
      return {
        activities: (persisted as { tasks: Activity[] }).tasks,
      };
    }
    return persisted as ActivityState;
  },
});
```

Behaviour:

- First boot writes the current version.
- Matching version skips migration.
- A version change runs `migrate`, **clears the outbox** (old patches target the old shape), persists the migrated state, and writes the new version.
- A version change without `migrate` throws an actionable error instead of loading incompatible data.

---

## Upgrade Checklist

- [ ] `pusher` returns `OutboxAck[]` for every pushed entry.
- [ ] The server treats `OutboxEntry.id` as an idempotency key.
- [ ] Partial responses are possible and safe (missing ids become `retry`).
- [ ] `conflict` and `rejected` are shown to the user.
- [ ] Remove assumptions that the outbox is compacted automatically.
- [ ] Audit custom resolvers for `lastSyncedBase` usage.
- [ ] Add `purge()` to logout and account switching.
- [ ] Scope `storageKey` per company/user.
- [ ] Set `schemaVersion` and add `migrate` before changing persisted shapes.
- [ ] Pull changes only when `pendingCount === 0`.
- [ ] Test an offline write, a restart, a reconnect, and a forced `conflict`.

---

## Testing the Upgrade

At minimum, cover these four scenarios:

1. **Offline write survives reload.** Create a mutation with the network disabled, reload, and confirm `pendingCount` is still `1`.
2. **Partial acknowledgement keeps the entry.** Return `retry` for one entry and `applied` for the rest; only the acknowledged entry disappears.
3. **Conflict does not loop.** Return `conflict`; confirm the entry leaves the outbox and `onPushResult` fires once.
4. **Migration clears stale patches.** Persist state at version 1 with a queued mutation, boot at version 2 with `migrate`, and confirm the state is migrated and `pendingCount` is `0`.

See [Reliable Sync](/docs/guides/reliable-sync) for the full server contract and [Testing](/docs/guides/testing) for `fake-indexeddb` setup.
