---
title: Testing
description: How to test components that use Syncraft Labs — setup fake-indexeddb, wrap React/Vue components with providers, mock fetcher/pusher, and reset registries between tests.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft testing, local-first testing, fake-indexeddb vitest, IndexedDB unit test, useSync test, React testing library syncraft
---

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
```

---

## Testing React Components

### Wrapping with Provider

Every test must wrap the rendered component in `<SyncraftProvider>`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SyncraftProvider, useSync } from "@syncraft-labs/react";
import { describe, it, expect } from "vitest";

interface TodoState {
  todos: Array<{ id: string; text: string }>;
}

function TestApp() {
  const { data, update, isHydrating } = useSync<TodoState>("test-todos", {
    initialState: { todos: [] },
  });

  if (isHydrating) return <div>Loading…</div>;

  return (
    <div>
      <button
        onClick={() =>
          update((draft) => {
            draft.todos.push({ id: "1", text: "Buy milk" });
          })
        }
      >
        Add
      </button>
      <ul>
        {data?.todos.map((t) => (
          <li key={t.id}>{t.text}</li>
        ))}
      </ul>
    </div>
  );
}

describe("TestApp", () => {
  it("adds a todo item optimistic update", async () => {
    render(
      <SyncraftProvider>
        <TestApp />
      </SyncraftProvider>
    );

    // Wait for hydration
    await waitFor(() => {
      expect(screen.queryByText("Loading…")).toBeNull();
    });

    // Trigger update
    fireEvent.click(screen.getByText("Add"));

    // Verify optimistic UI update
    expect(screen.getByText("Buy milk")).toBeDefined();
  });
});
```

---

## Testing Vue Components

Use `@vue/test-utils` and mount with `createSyncraft()` plugin:

```ts
import { mount } from "@vue/test-utils";
import { createSyncraft } from "@syncraft-labs/vue";
import { describe, it, expect } from "vitest";
import TodoComponent from "./TodoComponent.vue";

describe("TodoComponent", () => {
  it("renders correctly", async () => {
    const wrapper = mount(TodoComponent, {
      global: {
        plugins: [createSyncraft()],
      },
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Add Todo");
  });
});
```

---

## Resetting Registries Between Tests

To ensure test isolation, clean up stores between test runs:

```ts
import { beforeEach } from "vitest";
import { _resetRegistry } from "@syncraft-labs/react";

beforeEach(() => {
  // Clear any existing store singletons
  // When using <SyncraftProvider>, a fresh registry is created automatically per render
});
```
