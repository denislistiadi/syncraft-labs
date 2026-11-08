---
title: Kanban Board
description: Example of an offline-first collaborative Kanban board with optimistic updates and WebSocket sync.
---

A complete example of an offline-first Kanban board built with Syncraft Labs.

Features:
- Instant optimistic card moves between columns
- Offline persistence via IndexedDB
- Background mutation sync with token auth
- Live multi-user updates via WebSockets and `applyRemoteState`

---

## 1. Types

```ts
// types.ts
export type Priority = "low" | "medium" | "high";

export interface Card {
  id: string;
  title: string;
  priority: Priority;
}

export interface Column {
  id: string;
  title: string;
  cardIds: string[];
}

export interface BoardState {
  columns: Column[];
  cards: Record<string, Card>;
}
```

---

## 2. Hook (`useKanban`)

```tsx
// useKanban.ts
import { useEffect, useCallback } from "react";
import { useSync } from "@syncraft-labs/react";
import type { BoardState, Priority } from "./types";

const initialData: BoardState = {
  columns: [
    { id: "todo", title: "To Do", cardIds: [] },
    { id: "in_progress", title: "In Progress", cardIds: [] },
    { id: "done", title: "Done", cardIds: [] },
  ],
  cards: {},
};

export function useKanban(boardId: string, token: string) {
  const {
    data: board = initialData,
    update,
    applyRemoteState,
    isHydrating,
    isSyncing,
    isOffline,
  } = useSync<BoardState>(`board-${boardId}`, {
    initialState: initialData,

    // Merge remote cards with local drafts
    conflictStrategy: "custom",
    resolver: ({ local, remote }) => ({
      ...remote,
      cards: { ...remote.cards, ...local.cards },
      columns: local.columns,
    }),

    fetcher: () =>
      fetch(`/api/boards/${boardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),

    // Option A: Granular patch sync (Best for multi-user collaboration)
    pusher: (entries) =>
      fetch(`/api/boards/${boardId}/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(entries),
      }).then((r) => {
        if (!r.ok) throw new Error("Sync failed");
      }),

    // Option B: Traditional REST PUT (Simplest — no patch parsing on backend)
    // pusher: async () => {
    //   await fetch(`/api/boards/${boardId}`, {
    //     method: "PUT",
    //     headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    //     body: JSON.stringify(board),
    //   });
    // },
  });

  // Listen to remote changes
  useEffect(() => {
    if (isOffline) return;

    const ws = new WebSocket(`wss://${location.host}/ws/boards/${boardId}`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "UPDATE") {
        applyRemoteState(msg.data);
      }
    };

    return () => ws.close();
  }, [boardId, isOffline, applyRemoteState]);

  // Actions
  // Note: No manual fetch() needed here! update() records the mutation
  // into the IndexedDB outbox, and Syncraft's background loop automatically
  // triggers the `pusher` above to sync with the server.
  const addCard = useCallback(
    (colId: string, title: string, priority: Priority = "medium") => {
      const id = crypto.randomUUID();
      update((draft) => {
        draft.cards[id] = { id, title, priority };
        draft.columns.find((c) => c.id === colId)?.cardIds.unshift(id);
      });
    },
    [update]
  );

  const moveCard = useCallback(
    (cardId: string, fromColId: string, toColId: string, targetIndex = 0) => {
      update((draft) => {
        const from = draft.columns.find((c) => c.id === fromColId);
        const to = draft.columns.find((c) => c.id === toColId);
        if (!from || !to) return;

        from.cardIds = from.cardIds.filter((id) => id !== cardId);
        to.cardIds.splice(targetIndex, 0, cardId);
      });
    },
    [update]
  );

  return { board, isHydrating, isSyncing, isOffline, addCard, moveCard };
}
```

---

## 3. Component

```tsx
// KanbanBoard.tsx
import React, { useState } from "react";
import { useKanban } from "./useKanban";

export function KanbanBoard({ boardId, token }: { boardId: string; token: string }) {
  const { board, isHydrating, isSyncing, isOffline, addCard, moveCard } = useKanban(boardId, token);
  const [newTitle, setNewTitle] = useState("");

  if (isHydrating) return <div>Loading cached board...</div>;

  return (
    <div style={{ padding: 20 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <h2>Board</h2>
        {isOffline && <span style={{ color: "orange" }}>● Offline</span>}
        {isSyncing && <span style={{ color: "blue" }}>Syncing...</span>}
      </header>

      <div style={{ display: "flex", gap: 16 }}>
        {board.columns.map((col) => (
          <div
            key={col.id}
            style={{
              flex: 1,
              background: "#f4f4f5",
              borderRadius: 8,
              padding: 12,
              minHeight: 400,
            }}
          >
            <h3>{col.title} ({col.cardIds.length})</h3>

            {col.id === "todo" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTitle.trim()) return;
                  addCard(col.id, newTitle.trim());
                  setNewTitle("");
                }}
              >
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="New card..."
                  style={{ width: "100%", padding: 6, marginBottom: 8 }}
                />
              </form>
            )}

            {col.cardIds.map((cardId) => {
              const card = board.cards[cardId];
              if (!card) return null;
              return (
                <div
                  key={card.id}
                  style={{
                    background: "#fff",
                    padding: 8,
                    borderRadius: 6,
                    marginBottom: 8,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 500 }}>{card.title}</p>
                  <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                    {col.id !== "done" && (
                      <button
                        onClick={() => {
                          const next = col.id === "todo" ? "in_progress" : "done";
                          moveCard(card.id, col.id, next);
                        }}
                      >
                        Next →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Vue 3 Example

For Vue 3, use `@syncraft-labs/vue`:

```vue
<!-- KanbanBoard.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { useSync } from "@syncraft-labs/vue";
import type { BoardState } from "./types";

const props = defineProps<{ boardId: string }>();
const newTitle = ref("");

const { data: board, update, isOffline, isSyncing } = useSync<BoardState>(`board-${props.boardId}`, {
  initialState: { columns: [], cards: {} },
  fetcher: () => fetch(`/api/boards/${props.boardId}`).then((r) => r.json()),
  pusher: (entries) =>
    fetch(`/api/boards/${props.boardId}/sync`, {
      method: "POST",
      body: JSON.stringify(entries),
    }),
});

function addCard(colId: string) {
  if (!newTitle.value.trim()) return;
  const id = crypto.randomUUID();
  update((draft) => {
    draft.cards[id] = { id, title: newTitle.value.trim(), priority: "medium" };
    draft.columns.find((c) => c.id === colId)?.cardIds.unshift(id);
  });
  newTitle.value = "";
}
</script>

<template>
  <div>
    <span v-if="isOffline">Offline</span>
    <span v-if="isSyncing">Syncing...</span>
    <div v-for="col in board?.columns" :key="col.id">
      <h4>{{ col.title }}</h4>
      <input v-if="col.id === 'todo'" v-model="newTitle" @keydown.enter="addCard(col.id)" />
      <div v-for="id in col.cardIds" :key="id">
        {{ board?.cards[id]?.title }}
      </div>
    </div>
  </div>
</template>
```
