import { useSyncSuspense } from "@syncraft-labs/react";
import layoutStyles from "./styles/Layout.module.css";
import cardStyles from "./styles/Card.module.css";
import type { Todo, TodoState } from "./types.js";
import { fetcher, pusher } from "./mocks.js";
import { TaskHeader } from "./TaskHeader.js";
import { TaskInput } from "./TaskInput.js";
import { TaskList } from "./TaskList.js";
import { DevTools } from "./DevTools.js";

export function PlaygroundInner() {
  const { data, update, refetch, isSyncing, isOffline, error } = useSyncSuspense<TodoState>(
    "playground-app-state-v5",
    {
      fetcher,
      pusher,
      syncInterval: 4000,
    }
  );

  const handleAddTodo = (text: string) => {
    update((draft: TodoState) => {
      draft.todos.push({
        id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        done: false,
      });
    });
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

  const completedCount = data ? data.todos.filter((t: Todo) => t.done).length : 0;
  const totalCount = data ? data.todos.length : 0;

  return (
    <div className={layoutStyles.container}>
      <div className={layoutStyles.mainColumn}>
        <TaskHeader
          isOffline={isOffline}
          isSyncing={isSyncing}
          onRefresh={() => void refetch()}
        />
        <main className={cardStyles.card}>
          <TaskInput onAdd={handleAddTodo} />
          {error && (
            <div className={cardStyles.errorBanner}>
              <svg className={cardStyles.errorIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className={cardStyles.errorTitle}>Sync failed</h3>
                <p className={cardStyles.errorMessage}>{error.message}</p>
              </div>
            </div>
          )}
          {data && (
            <TaskList
              todos={data.todos}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
          {data && data.todos.length > 0 && (
            <div className={cardStyles.cardFooter}>
              <span>
                {completedCount} of {totalCount} completed
              </span>
              <span className={cardStyles.cardFooterPowered}>Powered by Syncraft Labs</span>
            </div>
          )}
        </main>
      </div>
      <div className={layoutStyles.sideColumn}>
        <DevTools data={data} isSyncing={isSyncing} isHydrating={false} isOffline={isOffline} />
      </div>
    </div>
  );
}
