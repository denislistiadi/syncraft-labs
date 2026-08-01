---
title: Multi-Store Architecture
description: Learn how to manage multiple Syncraft Labs stores in large-scale applications. Covers domain separation, singleton registry patterns, lazy initialization, memory cleanup, and shared type contracts.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft multi store, local-first architecture, state management enterprise, domain-driven state, IndexedDB multiple stores
---

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
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  preferences: {
    theme: "light" | "dark" | "system";
    language: string;
  };
}

export const userProfileOptions: UseSyncOptions<UserProfileState> = {
  initialState: {
    id: "",
    name: "Guest",
    email: "",
    avatarUrl: "",
    preferences: { theme: "system", language: "en" },
  },
  fetcher: () => fetch("/api/me").then((r) => r.json()),
  pusher: (entries) =>
    fetch("/api/me/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    }),
  syncInterval: 10_000,
};
```

Create a custom hook for each domain:

```tsx
// hooks/useUserProfile.ts
import { useSync } from "@syncraft-labs/react";
import { STORE_KEYS } from "../stores/keys";
import { userProfileOptions, type UserProfileState } from "../stores/user-profile";

export function useUserProfile() {
  return useSync<UserProfileState>(STORE_KEYS.USER_PROFILE, userProfileOptions);
}
```

---

## Cross-Store Dependencies

When components need data from multiple stores, compose hooks cleanly:

```tsx
function CheckoutHeader() {
  const { data: profile } = useUserProfile();
  const { data: cart } = useCart();
  const { data: settings } = useSettings();

  const totalItems = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const currency = settings?.currency ?? "USD";

  return (
    <header>
      <span>Welcome, {profile?.name}</span>
      <span>Cart: {totalItems} items ({currency})</span>
    </header>
  );
}
```

> **Rule:** Never nest store calls inside draft updaters. Keep stores decoupled — read from Store A and write to Store B in separate steps:

```tsx
// ❌ WRONG — do NOT do this
function TransferCredits() {
  const { update: updateWallet } = useWallet();
  const { update: updateRewards } = useRewards();

  const redeem = () => {
    updateRewards((draft) => {
      draft.points -= 100;
      // ❌ Calling another store inside a draft updater causes race conditions
      updateWallet((wDraft) => { wDraft.balance += 10; });
    });
  };
}

// ✅ RIGHT — decoupled updates
function TransferCredits() {
  const { update: updateWallet } = useWallet();
  const { update: updateRewards } = useRewards();

  const redeem = () => {
    updateRewards((draft) => {
      draft.points -= 100;
    });
    updateWallet((draft) => {
      draft.balance += 10;
    });
  };
}
```

---

## Memory and Resource Cleanup

By default, stores live in the singleton registry for the lifetime of the application. If your app has features used only occasionally (e.g., an Admin Panel or Settings Page), destroy those stores when the feature unmounts:

```tsx
import { useEffect } from "react";
import { useSync, destroyStore } from "@syncraft-labs/react";

function AdminPanel() {
  const sync = useSync<AdminState>("admin-analytics", adminOptions);

  // Optional: destroy store on unmount if no other component uses it
  useEffect(() => {
    return () => {
      // destroyStore(registry, key) if manual destruction is needed
    };
  }, []);

  return <div>{/* Admin UI */}</div>;
}
```

---

## Summary Matrix

| Domain | Key | Sync Interval | Persistence Strategy |
|--------|-----|---------------|----------------------|
| User Profile | `user-profile` | 10s | IndexedDB + Remote Fetch |
| Cart | `shopping-cart` | 3s | IndexedDB + Frequent Sync |
| Settings | `app-settings` | Off (local only) | IndexedDB only |
| Analytics | `admin-analytics` | 30s | On-demand + Auto-destroy |
