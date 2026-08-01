---
title: Cross-Tab Sync
description: How Syncraft Labs synchronizes state across browser tabs using BroadcastChannel — how it works, use cases, browser support, and limitations.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft cross-tab, BroadcastChannel state sync, multi-tab state management, local-first multi-tab, IndexedDB tab sync
---

Syncraft Labs automatically synchronizes state across browser tabs using the [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel). When a user updates state in one tab, all other tabs with the same store key are updated instantly — no server round-trip required.

---

## How It Works

```
Tab 1                                     Tab 2
┌─────────────────────┐                   ┌─────────────────────┐
│  useSync("cart")    │                   │  useSync("cart")    │
│  update(draft => {  │                   │                     │
│    draft.items.push │                   │                     │
│  })                 │                   │                     │
│         │           │                   │                     │
│         ▼           │                   │                     │
│  1. Memory update   │                   │                     │
│  2. Notify subs     │                   │                     │
│  3. ──BroadcastChannel──────────────▶   │  4. Receive message │
│  4. IndexedDB write │                   │  5. Update memory   │
│  5. Append outbox   │                   │  6. Notify subs     │
└─────────────────────┘                   └─────────────────────┘
```

### Step-by-Step

1. **Tab 1** calls `update()` — memory is updated immediately
2. **Tab 1** notifies its own subscribers (UI re-renders)
3. **Tab 1** posts a `SYNCRAFT_STATE_UPDATE` message via BroadcastChannel
4. **Tab 2** receives the message on the channel named `syncraft-{storageKey}`
5. **Tab 2** updates its in-memory state with the received snapshot
6. **Tab 2** notifies its own subscribers
7. **Tab 2** UI re-renders with the new state

---

## Behavior Details

- **Zero network calls:** Cross-tab sync uses pure browser inter-process communication. No network traffic is generated.
- **Same origin requirement:** BroadcastChannel only broadcasts across tabs sharing the exact same protocol, domain, and port (Same-Origin Policy).
- **Outbox draining:** Only the tab making the edit appends to the outbox queue. Secondary tabs receive the updated state snapshot so their local UI remains in sync without creating duplicate outbox entries.
