---
title: Scaling & Performance
description: Practical patterns for large datasets, multi-tab coordination, and high-frequency writes.
---

When your app deals with thousands of items, multiple browser tabs, or high-frequency updates, use these patterns to keep performance high and avoid excess network usage.

---

## 1. Normalize State

Avoid storing large arrays of items directly. Use a normalized `byId` map and an `allIds` array:

```ts
// ❌ Avoid: O(n) lookups and re-renders on every item change
interface BadState {
  items: Array<{ id: string; title: string; status: string }>;
}

// ✅ Recommended: O(1) lookups and isolated updates
interface GoodState {
  byId: Record<string, { id: string; title: string; status: string }>;
  allIds: string[];
}
```

Updating an item in normalized state:

```ts
update((draft) => {
  if (draft.byId[itemId]) {
    draft.byId[itemId].status = "completed";
  }
});
```

---

## 2. Multi-Tab Coordination (Single-Leader Sync)

If a user opens your app across 5 browser tabs, you only want **one tab** connecting to WebSockets and running the pusher loop.

Use the Web Locks API to elect one tab as coordinator:

```ts
// leader.ts
let isLeader = false;

if (typeof window !== "undefined" && "locks" in navigator) {
  navigator.locks.request("syncraft_leader", async () => {
    isLeader = true;
    console.log("This tab is now the sync leader");

    // Connect WebSocket only in leader tab
    const ws = new WebSocket("wss://api.example.com/sync");
    ws.onmessage = (e) => {
      // Broadcast to other tabs via BroadcastChannel or store.applyRemoteState
    };

    // Hold lock while tab is open
    await new Promise(() => {});
  });
}

export function isLeaderTab() {
  return isLeader;
}
```

Then in your `useSync` configuration:

```tsx
const { data, update } = useSync("workspace", {
  initialState,
  pusher: async (entries) => {
    // Only the leader tab pushes to the backend
    if (!isLeaderTab()) return;

    await fetch("/api/sync", {
      method: "POST",
      body: JSON.stringify(entries),
    });
  },
});
```

---

## 3. Compact Outbox Before Pushing

If users rapidly edit state (e.g. dragging sliders or typing notes), hundreds of mutations can queue up. `compactOutbox` merges consecutive edits to the same paths into a single patch:

```ts
import { compactOutbox } from "@syncraft-labs/core";

const { data, update } = useSync("notes", {
  initialState,
  pusher: async (entries) => {
    // Merge consecutive patches
    const result = compactOutbox(entries);
    const payload = result ? [result.compacted] : entries;

    await fetch("/api/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
});
```

---

## 4. Handle Storage Quotas (`onQuotaExceeded`)

Mobile devices and private windows have strict IndexedDB limits. If writes fail because the disk is full, evict older cached data instead of crashing:

```tsx
useSync("tickets", {
  initialState,
  onQuotaExceeded: async ({ quota, usage }) => {
    console.warn(`Storage quota low: ${usage}/${quota} bytes. Evicting old items...`);

    // Evict items older than 30 days from local cache
    update((draft) => {
      const monthAgo = Date.now() - 30 * 86400 * 1000;
      draft.allIds = draft.allIds.filter((id) => {
        const item = draft.byId[id];
        if (item && item.updatedAt < monthAgo) {
          delete draft.byId[id];
          return false;
        }
        return true;
      });
    });
  },
});
```

---

## 5. Encrypt Sensitive Data at Rest

Pass an `encryptionKey` (string, raw bytes, or `CryptoKey`) to encrypt state in IndexedDB using AES-GCM 256-bit:

```tsx
useSync("patient-records", {
  initialState,
  // Encrypts everything stored in IndexedDB for this store
  encryptionKey: userSessionKey,
});
```

---

## 6. Atomic Component Rendering

When rendering large lists, memoize rows with `React.memo` so only the row that changed re-renders:

```tsx
import React, { memo } from "react";

export const TaskRow = memo(
  function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
    return (
      <div>
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => onToggle(task.id)}
        />
        <span>{task.title}</span>
      </div>
    );
  },
  (prev, next) => prev.task === next.task
);
```
