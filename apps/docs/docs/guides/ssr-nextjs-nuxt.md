---
title: SSR — Next.js & Nuxt
description: Server-side rendering guide for Syncraft Labs with Next.js (App Router) and Nuxt 3. Covers provider placement, hydration mismatch prevention, client-only usage, and data leak isolation.
keywords:
  - syncraft SSR
  - syncraft Next.js
  - syncraft Nuxt
  - local-first SSR
  - IndexedDB server rendering
  - state hydration mismatch
sidebar_position: 3
---

# SSR — Next.js & Nuxt

Syncraft Labs is a **client-side library** — it depends on IndexedDB and BroadcastChannel, which don't exist on the server. This guide covers how to integrate safely with server-rendering frameworks.

---

## Why SSR Needs Special Handling

Without the Provider/Plugin pattern, stores would be **module-level singletons** — shared across all requests on the server. This causes:

| Problem | Impact |
|---------|--------|
| **Data leak between users** | User A sees User B's state |
| **Memory growth** | Stores never cleaned up between requests |
| **Hydration mismatch** | Server renders `undefined`, client hydrates from IndexedDB |

Syncraft Labs solves this with **request-scoped registries**:
- **React:** `<SyncraftProvider>` creates a new `Map` per render tree
- **Vue:** `createSyncraft()` creates a new `Map` per app instance

---

## Next.js (App Router)

### 1. Create a Client Provider

IndexedDB does not exist on the server. Mark the provider as a Client Component:

```tsx
// app/providers.tsx
"use client";

import { SyncraftProvider } from "@syncraft-labs/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SyncraftProvider>{children}</SyncraftProvider>;
}
```

### 2. Wrap in Root Layout

```tsx
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 3. Use `useSync` Only in Client Components

```tsx
// components/todo-list.tsx
"use client";

import { useSync } from "@syncraft-labs/react";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

export function TodoList() {
  const { data, update, isHydrating } = useSync<TodoState>("todos", {
    initialState: { todos: [] },
    fetcher: () => fetch("/api/todos").then((r) => r.json()),
  });

  if (isHydrating) return <p>Loading…</p>;

  return (
    <ul>
      {data?.todos.map((t) => (
        <li key={t.id}>{t.text}</li>
      ))}
    </ul>
  );
}
```

### 4. Use in a Server Component Page

```tsx
// app/page.tsx (Server Component — no "use client")
import { TodoList } from "@/components/todo-list";

export default function HomePage() {
  return (
    <main>
      <h1>My Todos</h1>
      {/* TodoList is a Client Component, safe to use here */}
      <TodoList />
    </main>
  );
}
```

### Handling Hydration Mismatch

During SSR, `useSync` returns `data: undefined` (IndexedDB isn't available). On the client, it hydrates and returns the persisted state. This is handled gracefully by `isHydrating`:

```tsx
// ✅ No mismatch — server and client both show the loading state
if (isHydrating) return <Skeleton />;

// After hydration, client renders from IndexedDB
return <DataView data={data} />;
```

> **Tip:** If using React Suspense with `useSyncSuspense`, wrap the component in `<Suspense>`. The thrown promise during hydration integrates naturally with Suspense boundaries.

---

## Next.js (Pages Router)

```tsx
// pages/_app.tsx
import { SyncraftProvider } from "@syncraft-labs/react";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SyncraftProvider>
      <Component {...pageProps} />
    </SyncraftProvider>
  );
}
```

All pages and components within `_app` can safely use `useSync`.

---

## Nuxt 3

### 1. Create a Client-Only Plugin

```ts
// plugins/syncraft.client.ts
import { createSyncraft } from "@syncraft-labs/vue";

export default defineNuxtPlugin((nuxtApp) => {
  const syncraft = createSyncraft();
  nuxtApp.vueApp.use(syncraft);
});
```

> **Note:** The `.client.ts` suffix ensures this plugin only runs in the browser. Nuxt will skip it during SSR.

### 2. Use the Composable in Components

```vue
<!-- components/TodoList.vue -->
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

interface TodoState {
  todos: Array<{ id: string; text: string; done: boolean }>;
}

const { data, update, isHydrating } = useSync<TodoState>("todos", {
  initialState: { todos: [] },
  fetcher: () => $fetch("/api/todos"),
});
</script>

<template>
  <p v-if="isHydrating">Loading…</p>
  <ul v-else>
    <li v-for="t in data?.todos" :key="t.id">{{ t.text }}</li>
  </ul>
</template>
```

### 3. Client-Only Components (Optional)

If you want to prevent any SSR rendering for Syncraft-powered components, use Nuxt's `<ClientOnly>`:

```vue
<!-- pages/index.vue -->
<template>
  <div>
    <h1>My Todos</h1>
    <ClientOnly>
      <TodoList />
      <template #fallback>
        <p>Loading…</p>
      </template>
    </ClientOnly>
  </div>
</template>
```

---

## How Isolation Works

```
Request 1 (User A)                   Request 2 (User B)
┌─────────────────────┐              ┌─────────────────────┐
│  SyncraftProvider    │              │  SyncraftProvider    │
│  registry = new Map  │              │  registry = new Map  │
│  ┌────────────────┐  │              │  ┌────────────────┐  │
│  │ "todos" → StoreA│  │              │  │ "todos" → StoreB│  │
│  └────────────────┘  │              │  └────────────────┘  │
└─────────────────────┘              └─────────────────────┘
         ↕ Isolated                           ↕ Isolated
```

Each `SyncraftProvider` (React) or `createSyncraft()` (Vue) creates a **fresh** `Map` registry. Stores are scoped to that registry — no data leaks between requests.

---

## Common Pitfalls

### ❌ Using `useSync` in a Server Component

```tsx
// app/page.tsx
// ❌ This will crash — IndexedDB doesn't exist on the server
import { useSync } from "@syncraft-labs/react";

export default function Page() {
  const { data } = useSync("todos", { initialState: { todos: [] } });
  return <div>{JSON.stringify(data)}</div>;
}
```

**Fix:** Move `useSync` into a Client Component (`"use client"`).

### ❌ Forgetting the Provider

```tsx
// ❌ This throws: "useSync must be used within a <SyncraftProvider>"
function App() {
  const { data } = useSync("todos", { initialState: { todos: [] } });
  return <div />;
}
```

**Fix:** Wrap your app in `<SyncraftProvider>` or install `createSyncraft()`.

### ❌ Dynamic Import Pitfalls

```tsx
// ❌ Avoid: lazy-loading Syncraft itself — it's tiny and tree-shakeable
const { useSync } = await import("@syncraft-labs/react");
```

The hook and provider are small enough to include in the main bundle. Dynamic imports add unnecessary complexity.

---

## Next Steps

- [Production Checklist →](./production-checklist.md) — Pre-deployment checks
- [Multi-Store Architecture →](./multi-store-architecture.md) — Managing stores in large apps
- [Error Handling →](./error-handling.md) — Error strategies for SSR apps
