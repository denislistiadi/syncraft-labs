---
title: Multi-Store Architecture
description: Learn how to manage multiple Syncraft Labs stores in large-scale applications. Covers domain separation, singleton registry patterns, lazy initialization, memory cleanup, and shared type contracts.
keywords:
  - syncraft multi store
  - local-first architecture
  - state management enterprise
  - domain-driven state
  - IndexedDB multiple stores
sidebar_position: 2
---

# Multi-Store Architecture

In large applications, a single store rarely suffices. Syncraft Labs supports **one store per key** — each key creates an isolated IndexedDB database with its own state and outbox. This guide covers patterns for managing multiple stores at scale.

---

## Domain Separation

Organize stores by **bounded context** — each domain gets its own store key:

```ts
// stores/keys.ts — Single source of truth for all store keys
export const STORE_KEYS = {
  USER_PROFILE: "user-profile",
  PRODUCTS: "products",
  CART: "shopping-cart",
  ORDERS: "orders",
  NOTIFICATIONS: "notifications",
  SETTINGS: "app-settings",
} as const;

export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS];
```

Each key gets its own IndexedDB database (`syncraft-labs_user-profile`, `syncraft-labs_products`, etc.) — fully isolated with separate state and outbox queues.

### Benefits of Domain Separation

| Benefit | Explanation |
|---------|-------------|
| **Isolation** | A corrupt outbox in `cart` doesn't affect `user-profile` |
| **Independent sync** | Each domain can have its own `pusher`, `fetcher`, and `syncInterval` |
| **Granular cleanup** | Destroy one store without affecting others |
| **Smaller payloads** | Each `pusher` call sends only relevant domain data |
| **Team boundaries** | Different teams own different domains without conflicts |

---

## Typed Store Definitions

Define each store's state shape alongside its configuration to enforce type safety:

```ts
// stores/user-profile.ts
import type { UseSyncOptions } from "@syncraft-labs/react";
import { STORE_KEYS } from "./keys";

export interface UserProfileState {
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string;
    preferences: {
      theme: "light" | "dark" | "system";
      locale: string;
    };
  } | null;
}

export const userProfileOptions: UseSyncOptions<UserProfileState> = {
  initialState: { user: null },
  fetcher: () => fetch("/api/me").then((r) => r.json()),
  pusher: async (entries) => {
    await fetch("/api/me/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    });
  },
  syncInterval: 30_000, // User profile changes infrequently
};

export const USER_PROFILE_KEY = STORE_KEYS.USER_PROFILE;
```

```ts
// stores/cart.ts
import type { UseSyncOptions } from "@syncraft-labs/react";
import { STORE_KEYS } from "./keys";

export interface CartState {
  items: Array<{
    productId: string;
    quantity: number;
    addedAt: number;
  }>;
  couponCode: string | null;
}

export const cartOptions: UseSyncOptions<CartState> = {
  initialState: { items: [], couponCode: null },
  pusher: async (entries) => {
    await fetch("/api/cart/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    });
  },
  syncInterval: 2000, // Cart syncs frequently
};

export const CART_KEY = STORE_KEYS.CART;
```

---

## Usage in Components

Components consume specific stores via their keys:

### React

```tsx
import { useSync } from "@syncraft-labs/react";
import { USER_PROFILE_KEY, userProfileOptions, type UserProfileState } from "../stores/user-profile";
import { CART_KEY, cartOptions, type CartState } from "../stores/cart";

function Header() {
  const { data: profile } = useSync<UserProfileState>(USER_PROFILE_KEY, userProfileOptions);
  const { data: cart } = useSync<CartState>(CART_KEY, cartOptions);

  return (
    <header>
      <span>Welcome, {profile?.user?.name ?? "Guest"}</span>
      <span>Cart ({cart?.items.length ?? 0})</span>
    </header>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";
import { USER_PROFILE_KEY, userProfileOptions, type UserProfileState } from "../stores/user-profile";
import { CART_KEY, cartOptions, type CartState } from "../stores/cart";

const { data: profile } = useSync<UserProfileState>(USER_PROFILE_KEY, userProfileOptions);
const { data: cart } = useSync<CartState>(CART_KEY, cartOptions);
</script>

<template>
  <header>
    <span>Welcome, {{ profile?.user?.name ?? "Guest" }}</span>
    <span>Cart ({{ cart?.items.length ?? 0 }})</span>
  </header>
</template>
```

---

## Singleton Registry Pattern

Syncraft Labs uses a **singleton registry** internally — calling `useSync("cart")` from multiple components returns the **same store instance**. This means:

```
Component A:  useSync("cart")  ──┐
                                  ├──▶ Same SyncStore instance
Component B:  useSync("cart")  ──┘       (shared memory, shared outbox)
```

### What This Guarantees

- **Consistent state** — All components see the same data at the same time
- **Single IndexedDB connection** — No duplicate DB handles per key
- **Shared outbox** — One sync loop per key, not per component
- **Zero extra config** — The registry is managed automatically by `SyncraftProvider` (React) or `createSyncraft()` (Vue)

### What to Watch Out For

```tsx
// ❌ DON'T: Pass different initialState for the same key
// The second call's initialState is IGNORED because the store already exists
useSync("cart", { initialState: { items: [] } });      // ← Creates store
useSync("cart", { initialState: { items: [preset] } }); // ← Uses existing store, ignores initialState

// ✅ DO: Define options once and share them
import { CART_KEY, cartOptions } from "../stores/cart";
useSync(CART_KEY, cartOptions); // consistent everywhere
```

---

## Lazy Initialization

Stores are created **on first use** — if a page never renders a component that calls `useSync("notifications")`, that store is never created, no IndexedDB database is opened, and no sync loop runs.

This makes Syncraft Labs naturally efficient for large apps with many domains:

```
Home page:         [user-profile] [cart]
Product page:      [user-profile] [cart] [products]
Checkout page:     [user-profile] [cart] [orders]
Settings page:     [user-profile] [settings]
Admin dashboard:   [user-profile] [notifications] [orders] [products]
```

Only the stores needed by the current route are active.

---

## Store Cleanup with `destroyStore()`

Stores **outlive components by default** — unmounting a component that uses `useSync("cart")` does NOT destroy the store. This is intentional: if the user navigates away and back, the store is still warm in memory.

For pages that should clean up (e.g., admin-only views, temporary wizards):

```tsx
function AdminDashboard() {
  const { data, destroyStore } = useSync<AdminState>("admin-metrics", opts);

  // Clean up when leaving the admin section
  useEffect(() => {
    return () => {
      destroyStore(); // Closes IndexedDB connection, clears listeners
    };
  }, [destroyStore]);

  return <Dashboard data={data} />;
}
```

### When to Destroy

| Scenario | Destroy? | Reason |
|----------|----------|--------|
| User navigates between pages | ❌ No | Store stays warm for fast return |
| User logs out | ✅ Yes | Clear all user-specific stores |
| Temporary wizard/modal | ✅ Yes | Short-lived state, clean up on close |
| Admin-only views | ⚠️ Maybe | Destroy if memory-sensitive |

### Destroying All Stores on Logout

```tsx
import { STORE_KEYS } from "../stores/keys";

function useLogout() {
  const registry = useSyncraftRegistry(); // custom hook to access registry

  return async () => {
    // Destroy all stores
    Object.values(STORE_KEYS).forEach((key) => {
      destroyStore(registry, key);
    });

    // Clear auth and redirect
    await auth.signOut();
    router.push("/login");
  };
}
```

---

## Folder Structure

For large apps, we recommend this layout:

```
src/
├── stores/
│   ├── keys.ts                   # All store keys (single source of truth)
│   ├── user-profile.ts           # State type + options for user-profile
│   ├── cart.ts                   # State type + options for cart
│   ├── orders.ts                 # State type + options for orders
│   ├── notifications.ts          # State type + options for notifications
│   └── index.ts                  # Re-exports for convenience
├── hooks/
│   ├── use-auth-sync.ts          # Auth-aware useSync wrapper
│   └── use-logout.ts             # Destroys all stores on logout
├── components/
│   ├── Header.tsx
│   └── CartDrawer.tsx
└── app/
    └── layout.tsx                # SyncraftProvider wraps here
```

---

## Next Steps

- [SSR (Next.js / Nuxt) →](./ssr-nextjs-nuxt.md) — Server-side rendering with multi-store
- [Sync Strategies →](./sync-strategies.md) — Design per-domain pusher endpoints
- [Testing →](./testing.md) — Test multi-store components
