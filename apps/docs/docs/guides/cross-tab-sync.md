---
title: Cross-Tab Sync
description: How Syncraft Labs synchronizes state across browser tabs using BroadcastChannel — how it works, use cases, browser support, and limitations.
keywords:
  - syncraft cross-tab
  - BroadcastChannel state sync
  - multi-tab state management
  - local-first multi-tab
  - IndexedDB tab sync
sidebar_position: 7
---

# Cross-Tab Sync

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
│                     │                   │  6. Notify subs     │
│                     │                   │  7. UI re-renders   │
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

### Message Format

```ts
// Internally posted by Syncraft Labs — not a public API
channel.postMessage({
  type: "SYNCRAFT_STATE_UPDATE",
  snapshot: nextState, // The full state after the mutation
});
```

---

## Zero Configuration Required

Cross-tab sync is enabled automatically. No extra setup needed:

```tsx
// This already syncs across tabs — nothing extra to add
const { data, update } = useSync<CartState>("cart", {
  initialState: { items: [] },
});
```

If a user adds an item to their cart in Tab 1, Tab 2 sees the update instantly.

---

## Use Cases

### Multi-Tab Dashboards

Users often open dashboards in multiple tabs. Cross-tab sync ensures all tabs show the same data:

```tsx
function Dashboard() {
  const { data } = useSync<DashboardState>("dashboard-filters", {
    initialState: {
      dateRange: "7d",
      department: "all",
      view: "chart",
    },
  });

  // Changing filters in one tab updates all tabs
  return <DashboardView filters={data} />;
}
```

### Shared Shopping Cart

```tsx
function CartBadge() {
  const { data } = useSync<CartState>("cart", {
    initialState: { items: [] },
  });

  // Badge count stays in sync across all tabs
  return <Badge count={data?.items.length ?? 0} />;
}
```

### Authentication State

```tsx
function AuthGuard({ children }) {
  const { data } = useSync<AuthState>("auth-session", {
    initialState: { isLoggedIn: false, user: null },
  });

  // When user logs out in one tab, all tabs redirect to login
  if (!data?.isLoggedIn) {
    return <Navigate to="/login" />;
  }

  return children;
}
```

### Theme / Preferences

```tsx
function ThemeProvider({ children }) {
  const { data, update } = useSync<PrefsState>("user-prefs", {
    initialState: { theme: "system", fontSize: 16 },
  });

  // Changing theme in one tab updates all tabs
  return (
    <div data-theme={data?.theme}>
      {children}
    </div>
  );
}
```

---

## Browser Support

BroadcastChannel is supported in all modern browsers:

| Browser | Support |
|---------|---------|
| Chrome | 54+ ✅ |
| Firefox | 38+ ✅ |
| Safari | 15.4+ ✅ |
| Edge | 79+ ✅ |
| iOS Safari | 15.4+ ✅ |
| Chrome Android | 54+ ✅ |

### Fallback Behavior

If `BroadcastChannel` is not available (e.g., older browsers, some WebView environments), Syncraft Labs gracefully degrades:

- **State still persists** to IndexedDB
- **Tabs won't sync in real-time** — but when a tab is focused/refreshed, it hydrates the latest state from IndexedDB
- **No errors thrown** — the channel initialization is wrapped in a feature check

```ts
// Internally (from store.ts)
if (typeof BroadcastChannel !== "undefined") {
  channel = new BroadcastChannel(`syncraft-${storageKey}`);
  // ... set up listener
}
// If BroadcastChannel is undefined, this block is simply skipped
```

---

## Limitations

| Limitation | Details |
|-----------|---------|
| **Same-origin only** | BroadcastChannel is restricted to the same origin (`protocol + hostname + port`) |
| **Not cross-device** | Only syncs between tabs on the same browser/device. Use `pusher`/`fetcher` for cross-device sync |
| **Full snapshot** | Each update sends the entire state snapshot, not patches. For very large states (>1MB), this may impact performance |
| **No ordering guarantee** | If two tabs update simultaneously, the last message received wins. Use `pusher` for authoritative conflict resolution |
| **No Service Worker** | BroadcastChannel messages aren't received by Service Workers (use a different channel for that) |

---

## Channel Cleanup

The BroadcastChannel is automatically closed when the store is destroyed:

```ts
// Calling destroyStore() or store.destroy() closes the channel
const { destroyStore } = useSync("cart", opts);

// On logout or cleanup
destroyStore(); // Channel is closed, no more messages sent/received
```

---

## Debugging

Open DevTools in multiple tabs and look for `[Syncraft Labs]` console messages. You can also manually inspect BroadcastChannel messages:

```js
// Paste in DevTools console to monitor cross-tab messages
const debugChannel = new BroadcastChannel("syncraft-cart");
debugChannel.onmessage = (e) => console.log("Cross-tab update:", e.data);
```

---

## Next Steps

- [Multi-Store Architecture →](./multi-store-architecture.md) — Cross-tab sync with multiple stores
- [Error Handling →](./error-handling.md) — Error behavior across tabs
- [Production Checklist →](./production-checklist.md) — Pre-deployment checks
