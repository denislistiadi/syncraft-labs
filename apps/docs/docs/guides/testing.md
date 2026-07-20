---
title: Testing
description: How to test components that use Syncraft Labs — setup fake-indexeddb, wrap React/Vue components with providers, mock fetcher/pusher, and reset registries between tests.
keywords:
  - syncraft testing
  - local-first testing
  - fake-indexeddb vitest
  - IndexedDB unit test
  - useSync test
  - React testing library syncraft
sidebar_position: 6
---

# Testing

Syncraft Labs stores state in IndexedDB, which doesn't exist in Node.js test environments. This guide shows how to set up your test environment and write effective tests.

---

## Test Environment Setup

### 1. Install `fake-indexeddb`

This polyfill provides an in-memory IndexedDB implementation for Node.js:

```bash
npm install -D fake-indexeddb
```

### 2. Configure Vitest

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
```

### 3. Create Setup File

```ts
// src/__tests__/setup.ts
import "fake-indexeddb/auto";

// fake-indexeddb/auto sets up global indexedDB, IDBKeyRange, etc.
// This makes Syncraft Labs work as if it were in a real browser.
```

> **Note:** This is the exact same setup used by Syncraft Labs's own test suite.

---

## Testing React Components

### Wrapping with Provider

Every component that calls `useSync` must be wrapped in `<SyncraftProvider>`:

```tsx
// src/__tests__/todo-list.test.tsx
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncraftProvider } from "@syncraft-labs/react";
import { TodoList } from "../components/TodoList";

function renderWithSyncraft(ui: React.ReactElement) {
  return render(<SyncraftProvider>{ui}</SyncraftProvider>);
}

describe("TodoList", () => {
  it("renders initial state after hydration", async () => {
    renderWithSyncraft(<TodoList />);

    // Wait for hydration to complete
    expect(await screen.findByText("Add Todo")).toBeInTheDocument();
  });

  it("adds a todo optimistically", async () => {
    renderWithSyncraft(<TodoList />);

    // Wait for hydration
    const addButton = await screen.findByText("Add Todo");

    // Click add
    await userEvent.click(addButton);

    // The todo should appear immediately (optimistic update)
    expect(await screen.findByText("New todo")).toBeInTheDocument();
  });
});
```

### Testing with Mock Fetcher/Pusher

```tsx
describe("TodoList with sync", () => {
  it("fetches initial data when IndexedDB is empty", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      todos: [{ id: "1", text: "Server todo", done: false }],
    });

    renderWithSyncraft(
      <TodoList
        fetcher={mockFetcher}
        pusher={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    // After hydration + fetch, the server data should appear
    expect(await screen.findByText("Server todo")).toBeInTheDocument();
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });

  it("calls pusher when mutations are synced", async () => {
    const mockPusher = vi.fn().mockResolvedValue(undefined);

    renderWithSyncraft(
      <TodoList
        fetcher={vi.fn().mockResolvedValue({ todos: [] })}
        pusher={mockPusher}
      />,
    );

    const addButton = await screen.findByText("Add Todo");
    await userEvent.click(addButton);

    // Wait for sync loop to fire (syncInterval default is 5000ms)
    // In tests, you may want to use a shorter interval
    await vi.advanceTimersByTimeAsync(6000);

    expect(mockPusher).toHaveBeenCalled();
    const entries = mockPusher.mock.calls[0][0];
    expect(entries).toHaveLength(1);
    expect(entries[0].snapshot.todos).toHaveLength(1);
  });
});
```

---

## Testing Vue Components

### Wrapping with Plugin

```ts
// src/__tests__/todo-list.test.ts
import { mount } from "@vue/test-utils";
import { createSyncraft } from "@syncraft-labs/vue";
import TodoList from "../components/TodoList.vue";

function mountWithSyncraft(component: any, options = {}) {
  return mount(component, {
    global: {
      plugins: [createSyncraft()],
    },
    ...options,
  });
}

describe("TodoList", () => {
  it("renders after hydration", async () => {
    const wrapper = mountWithSyncraft(TodoList);

    // Wait for hydration
    await wrapper.vm.$nextTick();
    // Allow IndexedDB operations to complete
    await new Promise((r) => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    expect(wrapper.find("button").text()).toBe("Add Todo");
  });
});
```

---

## Registry Reset for Test Isolation

Syncraft Labs uses a singleton registry — stores persist across tests unless explicitly cleaned up. Use `_resetRegistry()` to ensure clean state:

### React

```tsx
import { _resetRegistry } from "@syncraft-labs/react";

afterEach(() => {
  // When using SyncraftProvider, each provider has its own registry.
  // If you're sharing a registry across tests, reset it:
  // _resetRegistry(registry);
});
```

When using `<SyncraftProvider>`, each render creates a fresh registry, so tests are naturally isolated. You only need `_resetRegistry` if you're using a shared registry pattern.

### Vue

```ts
import { _resetRegistry } from "@syncraft-labs/vue";

afterEach(() => {
  // Same as React — each createSyncraft() creates a fresh registry
});
```

---

## Testing the Core Directly

For testing `@syncraft-labs/core` without a framework:

```ts
// src/__tests__/store.test.ts
import "fake-indexeddb/auto";
import { createSyncStore } from "@syncraft-labs/core";

describe("createSyncStore", () => {
  it("persists state to IndexedDB", async () => {
    const store = createSyncStore<{ count: number }>({
      storageKey: "test-counter",
      initialState: { count: 0 },
    });

    await store.hydrate();
    await store.set((draft) => { draft.count = 42; });

    // Destroy and recreate to verify persistence
    store.destroy();

    const store2 = createSyncStore<{ count: number }>({
      storageKey: "test-counter",
    });
    const hydrated = await store2.hydrate();

    expect(hydrated).toEqual({ count: 42 });
    store2.destroy();
  });

  it("rolls back on IndexedDB failure", async () => {
    const store = createSyncStore<{ count: number }>({
      storageKey: "test-rollback",
      initialState: { count: 0 },
    });

    await store.hydrate();

    // Simulate: destroy the store to trigger an error on set
    store.destroy();

    // Re-create and test rollback behavior
    const store2 = createSyncStore<{ count: number }>({
      storageKey: "test-rollback",
      initialState: { count: 0 },
    });
    await store2.hydrate();

    expect(store2.getSnapshot()).toEqual({ count: 0 });
    store2.destroy();
  });

  it("respects maxOutboxSize", async () => {
    const store = createSyncStore<{ count: number }>({
      storageKey: "test-outbox-limit",
      initialState: { count: 0 },
      maxOutboxSize: 3,
    });

    await store.hydrate();

    await store.set((d) => { d.count = 1; });
    await store.set((d) => { d.count = 2; });
    await store.set((d) => { d.count = 3; });

    // 4th mutation should throw
    await expect(
      store.set((d) => { d.count = 4; }),
    ).rejects.toThrow("Outbox size limit");

    store.destroy();
  });
});
```

---

## Test Utilities Cheat Sheet

| Utility | Package | Purpose |
|---------|---------|---------|
| `fake-indexeddb/auto` | `fake-indexeddb` | In-memory IndexedDB for Node.js |
| `SyncraftProvider` | `@syncraft-labs/react` | Wraps components with a fresh registry |
| `createSyncraft()` | `@syncraft-labs/vue` | Vue plugin for test mounting |
| `_resetRegistry()` | Both packages | Clears singleton registry between tests |
| `vi.advanceTimersByTimeAsync()` | Vitest | Fast-forward sync loop timers |
| `vi.fn()` | Vitest | Mock `fetcher` and `pusher` |

---

## Tips

1. **Use `vi.useFakeTimers()`** to control the sync loop timing in tests:
   ```ts
   beforeEach(() => vi.useFakeTimers());
   afterEach(() => vi.useRealTimers());
   ```

2. **Flush IndexedDB operations** — After calling `update()`, the IndexedDB write is async. Use `await act(async () => {})` (React) or `await flushPromises()` (Vue) to let it settle.

3. **Unique storage keys per test** — Use unique keys to avoid cross-test pollution:
   ```ts
   const key = `test-${Date.now()}-${Math.random()}`;
   ```

4. **Don't forget `store.destroy()`** — In core-level tests, always destroy stores in `afterEach` to close IndexedDB connections.

---

## Next Steps

- [Multi-Store Architecture →](./multi-store-architecture.md) — Testing multi-store apps
- [Error Handling →](./error-handling.md) — Testing error scenarios
- [Sync Strategies →](./sync-strategies.md) — Testing sync flows
