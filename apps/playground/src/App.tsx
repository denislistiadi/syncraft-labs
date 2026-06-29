import { useState } from "react";
import { useSync } from "@syncraft-labs/react";
import type { TodoState } from "./types";
import { fetcher, pusher } from "./api";
import { StatusBadge } from "./components/StatusBadge";
import { DevTools } from "./components/DevTools";

export function App() {
  const {
    data,
    update,
    refetch,
    isHydrating,
    isSyncing,
    isOffline,
    error,
  } = useSync<TodoState>("playground-app-state-v3", {
    fetcher,
    pusher,
    syncInterval: 3000,
  });

  const [newTodoText, setNewTodoText] = useState("");

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
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTodo();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-4 sm:p-8 md:p-16 font-sans">
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 items-start">
        
        {/* Left Column (Main App) */}
        <div className="w-full lg:w-3/5 flex flex-col gap-6">
          
          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Tasks</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Manage your local-first tasks efficiently.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <StatusBadge isOffline={isOffline} isSyncing={isSyncing} />
              <button
                onClick={() => void refetch()}
                disabled={isSyncing}
                className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                title="Refresh data"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </header>

          {/* Main Card */}
          <main className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
            
            {/* Input Section */}
            {!isHydrating && (
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="What needs to be done?"
                    className="flex-1 px-3.5 py-2 text-sm bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dark:text-zinc-100"
                  />
                  <button
                    onClick={handleAddTodo}
                    disabled={!newTodoText.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 dark:disabled:text-blue-300 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 dark:focus:ring-offset-zinc-900"
                  >
                    Add Task
                  </button>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div className="px-4 py-3 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/50 flex items-start gap-3">
                <svg className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Sync failed</h3>
                  <p className="text-sm text-red-700 dark:text-red-400/80 mt-0.5">{error.message}</p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isHydrating && (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <div className="w-5 h-5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                    <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {/* Task List */}
            {!isHydrating && data && (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.todos.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
                      <svg className="w-6 h-6 text-zinc-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No tasks remaining</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Get started by adding a new task above.</p>
                  </div>
                ) : (
                  data.todos.map((todo) => (
                    <div
                      key={todo.id}
                      className="group flex items-center gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <button
                        onClick={() => handleToggle(todo.id)}
                        className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 dark:focus:ring-offset-zinc-900 ${
                          todo.done
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600 text-transparent hover:border-blue-500"
                        }`}
                        aria-label={todo.done ? "Mark as incomplete" : "Mark as complete"}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>

                      <span
                        className={`flex-1 text-sm transition-all ${
                          todo.done ? "text-zinc-400 dark:text-zinc-500 line-through" : "text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {todo.text}
                      </span>

                      <button
                        onClick={() => handleDelete(todo.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        title="Delete task"
                        aria-label="Delete task"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {/* Footer Stats */}
            {!isHydrating && data && data.todos.length > 0 && (
              <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex justify-between items-center">
                <span>{data.todos.filter(t => t.done).length} of {data.todos.length} completed</span>
                <span className="hidden sm:inline">Powered by Syncraft Labs</span>
              </div>
            )}
          </main>
        </div>

        {/* Right Column (DevTools) */}
        <div className="w-full lg:w-2/5 lg:sticky lg:top-16">
          <DevTools data={data} isSyncing={isSyncing} isHydrating={isHydrating} isOffline={isOffline} />
        </div>
      </div>
    </div>
  );
}
