import React, { useState } from 'react';
import Layout from '@theme/Layout';
import styles from './playground.module.css';

// ── Types ──────────────────────────────────────────────────────

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

interface TodoState {
  todos: Todo[];
}

// ── Mock API (simulates server latency) ────────────────────────

const fetcher = async (): Promise<TodoState> => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return {
    todos: [
      { id: 'seed-1', text: 'Integrate Syncraft Labs core', done: true },
      { id: 'seed-2', text: 'Review pull requests', done: true },
      { id: 'seed-3', text: 'Update documentation', done: false },
    ],
  };
};

const pusher = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (Math.random() < 0.1) {
    throw new Error('Server timeout');
  }
};

// ── Lazy-loaded Playground (only loads in browser) ─────────────

function PlaygroundInner() {
  // Dynamically require to avoid SSR issues with IndexedDB
  const { useSyncSuspense } = require('@syncraft-labs/react') as typeof import('@syncraft-labs/react');

  const {
    data,
    update,
    refetch,
    isSyncing,
    isOffline,
    error,
  } = useSyncSuspense<TodoState>('playground-app-state-v4', {
    fetcher,
    pusher,
    syncInterval: 3000,
  });

  const [newTodoText, setNewTodoText] = useState('');

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

    setNewTodoText('');
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
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTodo();
    }
  };

  return (
    <div className={styles.container}>
      {/* ── Left Column (Main App) ────────────────────────── */}
      <div className={styles.mainColumn}>
        {/* Header */}
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Tasks</h1>
            <p className={styles.headerSubtitle}>
              Manage your local-first tasks efficiently.
            </p>
          </div>

          <div className={styles.headerActions}>
            <StatusBadge isOffline={isOffline} isSyncing={isSyncing} />
            <button
              onClick={() => void refetch()}
              disabled={isSyncing}
              className={styles.refreshButton}
              title="Refresh data"
            >
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Main Card */}
        <main className={styles.card}>
          {/* Input Section */}
          <div className={styles.inputSection}>
              <div className={styles.inputRow}>
                <input
                  type="text"
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What needs to be done?"
                  className={styles.textInput}
                  id="playground-todo-input"
                />
                <button
                  onClick={handleAddTodo}
                  disabled={!newTodoText.trim()}
                  className={styles.addButton}
                  id="playground-add-button"
                >
                  Add Task
                </button>
              </div>
            </div>

          {/* Error Banner */}
          {error && (
            <div className={styles.errorBanner}>
              <svg
                className={styles.errorIcon}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className={styles.errorTitle}>Sync failed</h3>
                <p className={styles.errorMessage}>{error.message}</p>
              </div>
            </div>
          )}

          {/* Task List */}
          {data && (
            <div className={styles.taskList}>
              {data.todos.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                      />
                    </svg>
                  </div>
                  <h3 className={styles.emptyTitle}>No tasks remaining</h3>
                  <p className={styles.emptySubtitle}>
                    Get started by adding a new task above.
                  </p>
                </div>
              ) : (
                data.todos.map((todo: Todo) => (
                  <div key={todo.id} className={styles.taskItem}>
                    <button
                      onClick={() => handleToggle(todo.id)}
                      className={
                        todo.done ? styles.checkboxChecked : styles.checkbox
                      }
                      aria-label={
                        todo.done ? 'Mark as incomplete' : 'Mark as complete'
                      }
                    >
                      <svg
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>

                    <span
                      className={
                        todo.done ? styles.taskTextDone : styles.taskText
                      }
                    >
                      {todo.text}
                    </span>

                    <button
                      onClick={() => handleDelete(todo.id)}
                      className={styles.deleteButton}
                      title="Delete task"
                      aria-label="Delete task"
                    >
                      <svg
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Footer Stats */}
          {data && data.todos.length > 0 && (
            <div className={styles.cardFooter}>
              <span>
                {data.todos.filter((t: Todo) => t.done).length} of{' '}
                {data.todos.length} completed
              </span>
              <span className={styles.cardFooterPowered}>
                Powered by Syncraft Labs
              </span>
            </div>
          )}
        </main>
      </div>

      {/* ── Right Column (DevTools) ───────────────────────── */}
      <div className={styles.sideColumn}>
        <DevTools
          data={data}
          isSyncing={isSyncing}
          isHydrating={false}
          isOffline={isOffline}
        />
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function StatusBadge({
  isOffline,
  isSyncing,
}: {
  isOffline: boolean;
  isSyncing: boolean;
}) {
  if (isOffline) {
    return (
      <div className={styles.badgeOffline}>
        <div className={styles.badgeDotRed} />
        Offline
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className={styles.badgeSyncing}>
        <svg
          className={styles.spinner}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className={styles.spinnerTrack}
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className={styles.spinnerArc}
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        Syncing
      </div>
    );
  }

  return (
    <div className={styles.badgeSynced}>
      <div className={styles.badgeDotGreen} />
      Synced
    </div>
  );
}

function DevTools({
  data,
  isSyncing,
  isHydrating,
  isOffline,
}: {
  data: TodoState | undefined;
  isSyncing: boolean;
  isHydrating: boolean;
  isOffline: boolean;
}) {
  const syntaxHighlight = (json: string) => {
    return json
      .replace(
        /"([^"]+)":/g,
        `<span class="${styles.syntaxKey}">"$1"</span>:`,
      )
      .replace(
        /: (true|false)/g,
        `: <span class="${styles.syntaxBool}">$1</span>`,
      );
  };

  return (
    <div className={styles.devTools}>
      <div className={styles.devToolsHeader}>
        <div className={styles.devToolsTitle}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <span>Store Inspector</span>
        </div>
        <div className={styles.devToolsStatus}>
          <span className={styles.devToolsStatusLabel}>Status</span>
          {isHydrating && (
            <span className={styles.statusDotBlue} title="Hydrating" />
          )}
          {isSyncing && (
            <span className={styles.statusDotAmber} title="Syncing" />
          )}
          {isOffline && (
            <span className={styles.statusDotRed} title="Offline" />
          )}
          {!isOffline && !isSyncing && !isHydrating && (
            <span className={styles.statusDotGreen} title="Idle" />
          )}
        </div>
      </div>
      <div className={styles.devToolsBody}>
        {data ? (
          <pre
            dangerouslySetInnerHTML={{
              __html:
                `<span class="${styles.syntaxKeyword}">const</span> storeState <span class="${styles.syntaxKeyword}">=</span> ` +
                syntaxHighlight(JSON.stringify(data, null, 2)),
            }}
          />
        ) : (
          <div className={styles.devToolsEmpty}>No data available</div>
        )}
      </div>
      <div className={styles.devToolsFooter}>
        <span>Powered by IndexedDB &amp; Immer</span>
        <span className={styles.devToolsBadge}>O(1) Drafts</span>
      </div>
    </div>
  );
}

// ── BrowserOnly wrapper ────────────────────────────────────────

function PlaygroundBrowserOnly() {
  // BrowserOnly ensures this component only renders client-side
  // (IndexedDB and useSync are browser-only APIs)
  const BrowserOnly =
    require('@docusaurus/BrowserOnly').default;

  return (
    <BrowserOnly fallback={<PlaygroundFallback />}>
      {() => {
        const { SyncraftProvider } = require('@syncraft-labs/react') as typeof import('@syncraft-labs/react');
        return (
          <SyncraftProvider>
            <React.Suspense fallback={<PlaygroundFallback />}>
              <PlaygroundInner />
            </React.Suspense>
          </SyncraftProvider>
        );
      }}
    </BrowserOnly>
  );
}

function PlaygroundFallback() {
  return (
    <div className={styles.container}>
      <div className={styles.mainColumn}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Tasks</h1>
            <p className={styles.headerSubtitle}>
              Loading playground…
            </p>
          </div>
        </header>
        <main className={styles.card}>
          <div className={styles.skeleton}>
            {[1, 2, 3].map((i: number) => (
              <div key={i} className={styles.skeletonRow}>
                <div className={styles.skeletonCheckbox} />
                <div className={styles.skeletonText} />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Page export ────────────────────────────────────────────────

export default function PlaygroundPage(): React.ReactNode {
  return (
    <Layout
      title="Playground"
      description="Interactive playground for Syncraft Labs — test local-first state synchronization with a live Todo app demo."
    >
      <div className={styles.pageWrapper}>
        <PlaygroundBrowserOnly />
      </div>
    </Layout>
  );
}
