---
title: Production Checklist
description: A comprehensive pre-deployment checklist for shipping Syncraft Labs to production. Covers outbox limits, error handling, IndexedDB storage quota, authentication, HTTPS, CSP, and monitoring.
keywords:
  - syncraft production
  - local-first production checklist
  - IndexedDB production
  - offline-first deployment
  - state sync production
sidebar_position: 1
---

# Production Checklist

Before shipping your Syncraft Labs–powered application to production, walk through each item below. These recommendations come from real-world patterns observed in large-scale, offline-capable apps.

---

## 1. Configure Outbox Size Limits

Every call to `update()` appends an `OutboxEntry` to IndexedDB. If users stay offline for hours (or days), the outbox can grow without bound — eventually exhausting the browser's storage quota.

**Set `maxOutboxSize` explicitly:**

```ts
const store = createSyncStore<AppState>({
  storageKey: "orders",
  initialState: { orders: [] },
  maxOutboxSize: 500, // default is 1000
});
```

When the limit is reached, `set()` throws an error that you can catch to show a user-facing prompt:

```tsx
const { update, error } = useSync<AppState>("orders", {
  initialState: { orders: [] },
  pusher: pushToServer,
});

// In your UI
{error?.message.includes("Outbox size limit") && (
  <div className="alert alert-warning">
    Too many pending changes. Please connect to the internet to sync.
  </div>
)}
```

> **Guideline:** Set `maxOutboxSize` to a value that balances offline productivity with storage constraints. For most apps, 200–1000 entries is reasonable.

---

## 2. Handle Errors Gracefully

Syncraft Labs uses an **optimistic update with pessimistic rollback** strategy. When an IndexedDB write fails:

1. The in-memory state is **rolled back** to the previous value.
2. All subscribers are re-notified with the reverted state.
3. The error is captured in the `error` field returned by `useSync`.

**Always render the `error` state in your UI:**

```tsx
const { data, update, error } = useSync<AppState>("dashboard", opts);

return (
  <div>
    {error && (
      <Toast type="error">
        Save failed: {error.message}. Your changes have been reverted.
      </Toast>
    )}
    {/* rest of UI */}
  </div>
);
```

For React apps, wrap your tree in an [Error Boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) to catch unexpected throws. See the [Error Handling guide](./error-handling.md) for complete patterns.

---

## 3. Monitor IndexedDB Storage Quota

Browsers enforce storage quotas. When the quota is exceeded, IndexedDB writes fail and Syncraft Labs will roll back the optimistic update.

**Check available storage proactively:**

```ts
async function checkStorageQuota() {
  if ("storage" in navigator && "estimate" in navigator.storage) {
    const { usage, quota } = await navigator.storage.estimate();
    const usedMB = (usage ?? 0) / (1024 * 1024);
    const quotaMB = (quota ?? 0) / (1024 * 1024);
    const percentUsed = ((usage ?? 0) / (quota ?? 1)) * 100;

    console.log(`Storage: ${usedMB.toFixed(1)}MB / ${quotaMB.toFixed(1)}MB (${percentUsed.toFixed(1)}%)`);

    if (percentUsed > 80) {
      // Warn user or trigger outbox drain
      console.warn("Storage quota is running low!");
    }
  }
}
```

**Request persistent storage to prevent eviction:**

```ts
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist();
    console.log(`Persistent storage ${granted ? "granted" : "denied"}`);
  }
}
```

> **Why?** Without persistent storage, browsers may silently evict IndexedDB data under storage pressure (especially Safari and Firefox). Requesting persistence ensures user data survives.

---

## 4. Secure Your `fetcher` and `pusher`

In production, every API call needs proper authentication. Inject auth tokens into your `fetcher` and `pusher`:

```tsx
function useAuthSync<T extends object>(key: string, opts: UseSyncOptions<T>) {
  const { getAccessToken } = useAuth(); // your auth hook

  return useSync<T>(key, {
    ...opts,
    fetcher: opts.fetcher
      ? async () => {
          const token = await getAccessToken();
          const res = await fetch("/api/data", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
          return res.json();
        }
      : undefined,
    pusher: opts.pusher
      ? async (entries) => {
          const token = await getAccessToken();
          const res = await fetch("/api/sync", {
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

> **Important:** Never store auth tokens in Syncraft stores. Tokens should live in secure, httpOnly cookies or a dedicated auth manager — not in IndexedDB.

---

## 5. Require HTTPS

IndexedDB is available over HTTP in development, but production apps **must** use HTTPS for:

- **Service Worker support** (required for full offline capability)
- **Persistent storage** (`navigator.storage.persist()` requires a secure context)
- **BroadcastChannel** works on HTTP but cross-tab sync is only meaningful in secure contexts

Ensure your deployment serves over HTTPS. All major hosts (Vercel, Netlify, Cloudflare) provide HTTPS by default.

---

## 6. Content Security Policy

If your app uses a strict CSP, ensure that `worker-src` and `script-src` allow `blob:` URIs if you plan to use Web Workers alongside Syncraft. The core library itself does not use workers, but your `pusher` implementation might.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self' blob:;
```

---

## 7. Monitoring and Observability

Subscribe to store changes for logging and telemetry:

```ts
import { createSyncStore } from "@syncraft-labs/core";

const store = createSyncStore<AppState>({
  storageKey: "critical-data",
  initialState: defaultState,
});

// Monitor outbox growth
setInterval(async () => {
  const outbox = await store.getOutbox();
  if (outbox.length > 100) {
    analytics.track("outbox_growth_warning", {
      count: outbox.length,
      oldestEntry: outbox[0]?.timestamp,
    });
  }
}, 60_000);

// Monitor state changes
store.subscribe((state) => {
  analytics.track("state_updated", {
    storageKey: "critical-data",
    timestamp: Date.now(),
  });
});
```

---

## Quick Reference

| Item | Priority | Details |
|------|----------|---------|
| `maxOutboxSize` | 🔴 Critical | Prevents unbounded outbox growth |
| Error state UI | 🔴 Critical | Show rollback errors to users |
| Auth in fetcher/pusher | 🔴 Critical | Secure all API calls |
| HTTPS | 🔴 Critical | Required for persistence APIs |
| Storage quota monitoring | 🟡 Important | Proactive quota checks |
| Persistent storage request | 🟡 Important | Prevent silent data eviction |
| CSP headers | 🟢 Nice-to-have | Only needed for strict CSP policies |
| Telemetry / monitoring | 🟢 Nice-to-have | Production observability |

---

## Next Steps

- [Error Handling →](./error-handling.md) — Deep-dive into error strategies
- [Sync Strategies →](./sync-strategies.md) — Design your pusher endpoint
- [SSR (Next.js / Nuxt) →](./ssr-nextjs-nuxt.md) — Server-side rendering setup
