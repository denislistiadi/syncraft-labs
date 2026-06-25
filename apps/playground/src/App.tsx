/**
 * Syncraft Playground — Todo List Demo
 *
 * Demonstrates:
 * - Local-first state with `useSync`
 * - Optimistic UI updates via Immer drafts
 * - Auto-hydration from IndexedDB
 * - Background sync with mock pusher (10% failure rate)
 * - Network status tracking (online/offline badge)
 * - Refetch button for pull-to-refresh
 * - Error toast on sync/fetch failure
 */

import { useState } from "react";
import { useSync } from "@syncraft/react";
import type { OutboxEntry } from "@syncraft/core";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

interface TodoState {
  todos: Todo[];
}

// ─────────────────────────────────────────────────────────────
// Mock Network Functions
// ─────────────────────────────────────────────────────────────

/** Simulates fetching todos from a server (1s network delay). */
const fetcher = async (): Promise<TodoState> => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return {
    todos: [
      { id: "seed-1", text: "Build Syncraft core ⚡", done: true },
      { id: "seed-2", text: "Add React hooks wrapper", done: true },
      { id: "seed-3", text: "Test offline sync", done: false },
    ],
  };
};

/** Simulates pushing mutations to a server (500ms delay, 10% failure rate). */
const pusher = async (_entries: readonly OutboxEntry<TodoState>[]): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (Math.random() < 0.1) {
    throw new Error("Network error: server unreachable (mock 10% failure)");
  }
};

// ─────────────────────────────────────────────────────────────
// App Component
// ─────────────────────────────────────────────────────────────

export function App() {
  const {
    data,
    update,
    refetch,
    isHydrating,
    isSyncing,
    isOffline,
    error,
  } = useSync<TodoState>("playground-todos", {
    fetcher,
    pusher,
    syncInterval: 3000,
  });

  const [newTodoText, setNewTodoText] = useState("");

  // ── Handlers ────────────────────────────────────────────────

  const handleAddTodo = () => {
    const text = newTodoText.trim();
    if (!text) return;

    update((draft) => {
      draft.todos.push({
        id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        done: false,
      });
    });

    setNewTodoText("");
  };

  const handleToggle = (id: string) => {
    update((draft) => {
      const todo = draft.todos.find((t) => t.id === id);
      if (todo) todo.done = !todo.done;
    });
  };

  const handleDelete = (id: string) => {
    update((draft) => {
      draft.todos = draft.todos.filter((t) => t.id !== id);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAddTodo();
  };

  // ── Status Badge ────────────────────────────────────────────

  const statusBadge = isOffline
    ? { icon: "🔴", label: "Offline", color: "bg-red-500/20 text-red-300 border-red-500/30" }
    : isSyncing
      ? { icon: "🔄", label: "Syncing", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" }
      : { icon: "🟢", label: "Online", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="w-full max-w-lg mb-8 text-center">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
          Syncraft Playground
        </h1>
        <p className="text-slate-400 text-sm">
          Local-first state sync — try adding todos, then go offline
        </p>
      </div>

      {/* ── Main Card ──────────────────────────────────── */}
      <div className="w-full max-w-lg bg-slate-800/60 backdrop-blur-lg rounded-2xl border border-slate-700/50 shadow-2xl shadow-indigo-500/10 overflow-hidden">
        {/* ── Card Header ──────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">📝 Todos</span>
            {data && (
              <span className="text-xs text-slate-500">
                {data.todos.filter((t) => !t.done).length} remaining
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Status Badge */}
            <span
              id="status-badge"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${statusBadge.color}`}
            >
              {statusBadge.icon} {statusBadge.label}
            </span>

            {/* Refetch Button */}
            <button
              id="refetch-button"
              onClick={() => void refetch()}
              disabled={isSyncing}
              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700/50 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Refetch from server"
            >
              <svg className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Loading Skeleton ─────────────────────────── */}
        {isHydrating && (
          <div className="p-6 space-y-3" id="loading-skeleton">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        )}

        {/* ── Todo Input ───────────────────────────────── */}
        {!isHydrating && (
          <>
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-700/30">
              <input
                id="todo-input"
                type="text"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What needs to be done?"
                className="flex-1 bg-slate-900/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
              />
              <button
                id="add-button"
                onClick={handleAddTodo}
                disabled={!newTodoText.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                Add
              </button>
            </div>

            {/* ── Todo List ──────────────────────────────── */}
            <div className="divide-y divide-slate-700/30">
              {data?.todos.length === 0 && (
                <div className="px-6 py-12 text-center text-slate-500 text-sm">
                  No todos yet. Add one above! ✨
                </div>
              )}

              {data?.todos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center gap-3 px-6 py-3.5 group hover:bg-slate-700/20 transition-colors"
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggle(todo.id)}
                    className={`flex-shrink-0 w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${
                      todo.done
                        ? "bg-indigo-600 border-indigo-600"
                        : "border-slate-500 hover:border-indigo-400"
                    }`}
                  >
                    {todo.done && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Text */}
                  <span
                    className={`flex-1 text-sm transition-all ${
                      todo.done ? "line-through text-slate-500" : "text-slate-200"
                    }`}
                  >
                    {todo.text}
                  </span>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(todo.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 rounded transition-all"
                    title="Delete todo"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Footer Stats ─────────────────────────────── */}
        {!isHydrating && data && data.todos.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700/30 text-xs text-slate-500">
            <span>
              {data.todos.filter((t) => t.done).length}/{data.todos.length} completed
            </span>
            <span>Powered by IndexedDB + Immer</span>
          </div>
        )}
      </div>

      {/* ── Error Toast ────────────────────────────────── */}
      {error && (
        <div
          id="error-toast"
          className="fixed bottom-6 right-6 max-w-sm bg-red-950/90 backdrop-blur border border-red-500/30 rounded-xl px-4 py-3 shadow-lg shadow-red-500/10 animate-[slideUp_0.3s_ease-out]"
        >
          <div className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-medium text-red-300">Sync Error</p>
              <p className="text-xs text-red-400/80 mt-0.5">{error.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Info Footer ────────────────────────────────── */}
      <div className="mt-8 text-center text-xs text-slate-600 space-y-1">
        <p>Data persists in IndexedDB — refresh the page and your todos are still here.</p>
        <p>Toggle browser DevTools → Network → Offline to test offline mode.</p>
      </div>
    </div>
  );
}
