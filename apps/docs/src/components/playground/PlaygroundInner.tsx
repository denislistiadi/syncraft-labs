import { useState } from "react";
import { useSyncSuspense } from "@syncraft-labs/react";
import layout from "./styles/Layout.module.css";
import headerStyles from "./styles/Header.module.css";
import cardStyles from "./styles/Card.module.css";
import taskStyles from "./styles/Task.module.css";
import badgeStyles from "./styles/Badge.module.css";
const styles = { ...layout, ...headerStyles, ...cardStyles, ...taskStyles, ...badgeStyles };
import type { Todo, TodoState } from "./types.js";
import { fetcher, pusher } from "./mocks.js";
import { StatusBadge } from "./StatusBadge.js";
import { DevTools } from "./DevTools.js";

export function PlaygroundInner() {
  const { data, update, refetch, isSyncing, isOffline, error } = useSyncSuspense<TodoState>("playground-app-state-v5", {
    fetcher,
    pusher,
    syncInterval: 4000,
  });

  const [newTodoText, setNewTodoText] = useState("");

  const handleAddTodo = () => {
    const text = newTodoText.trim();
    if (!text) return;
    update((draft: TodoState) => {
      draft.todos.push({
        id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        done: false,
      });
    });
    setNewTodoText("");
  };

  const handleToggle = (id: string) => {
    update((draft: TodoState) => {
      const todo = draft.todos.find((t: Todo) => t.id === id);
      if (todo) todo.done = !todo.done;
    });
  };

  const handleDelete = (id: string) => {
    update((draft: TodoState) => {
      draft.todos = draft.todos.filter((t: Todo) => t.id !== id);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTodo();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.mainColumn}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>Tasks</h2>
            <p className={styles.headerSubtitle}>Manage your local-first tasks efficiently.</p>
          </div>
          <div className={styles.headerActions}>
            <StatusBadge isOffline={isOffline} isSyncing={isSyncing} />
            <button onClick={() => void refetch()} disabled={isSyncing} className={styles.refreshButton} title="Refresh data">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </header>
        <main className={styles.card}>
          <div className={styles.inputSection}>
            <div className={styles.inputRow}>
              <input type="text" value={newTodoText} onChange={(e) => setNewTodoText(e.target.value)} onKeyDown={handleKeyDown} placeholder="What needs to be done?" className={styles.textInput} id="playground-todo-input" />
              <button onClick={handleAddTodo} disabled={!newTodoText.trim()} className={styles.addButton} id="playground-add-button">
                Add Task
              </button>
            </div>
          </div>
          {error && (
            <div className={styles.errorBanner}>
              <svg className={styles.errorIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className={styles.errorTitle}>Sync failed</h3>
                <p className={styles.errorMessage}>{error.message}</p>
              </div>
            </div>
          )}
          {data && (
            <div className={styles.taskList}>
              {data.todos.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <h3 className={styles.emptyTitle}>No tasks remaining</h3>
                  <p className={styles.emptySubtitle}>Get started by adding a new task above.</p>
                </div>
              ) : (
                data.todos.map((todo: Todo) => (
                  <div key={todo.id} className={styles.taskItem}>
                    <button onClick={() => handleToggle(todo.id)} className={todo.done ? styles.checkboxChecked : styles.checkbox} aria-label={todo.done ? "Mark as incomplete" : "Mark as complete"}>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <span className={todo.done ? styles.taskTextDone : styles.taskText}>{todo.text}</span>
                    <button onClick={() => handleDelete(todo.id)} className={styles.deleteButton} title="Delete task" aria-label="Delete task">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          {data && data.todos.length > 0 && (
            <div className={styles.cardFooter}>
              <span>
                {data.todos.filter((t: Todo) => t.done).length} of {data.todos.length} completed
              </span>
              <span className={styles.cardFooterPowered}>Powered by Syncraft Labs</span>
            </div>
          )}
        </main>
      </div>
      <div className={styles.sideColumn}>
        <DevTools data={data} isSyncing={isSyncing} isHydrating={false} isOffline={isOffline} />
      </div>
    </div>
  );
}
