import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSync } from "@syncraft-labs/react";
import { createApiClient, type ApiHealth } from "../shared/api.js";
import { addCard, createEmptyBoard, deleteCard, editCard, getColumnOf, moveCard, moveCardBy, moveCardToColumn, moveCardWithinColumn } from "../shared/board.js";
import { siblingAppUrl } from "../shared/config.js";
import { formatRelativeTime } from "../shared/format.js";
import { createEventLog } from "../shared/log.js";
import { requestLocalCacheClear } from "../shared/reset.js";
import { createBoardSyncOptions, STORAGE_KEY } from "../shared/store.js";
import { openBoardStream } from "../shared/stream.js";
import type { BoardState } from "../shared/types.js";
import { shortId } from "../shared/ui.js";
import { CardDialog } from "./CardDialog.js";
import { DevtoolsPanel } from "./DevtoolsPanel.js";
import { KanbanBoard } from "./KanbanBoard.js";
import { TestLab } from "./TestLab.js";
import { WakeBanner } from "./WakeBanner.js";

type StreamState = "connecting" | "open" | "reconnecting";

const HEALTH_LABELS: Record<ApiHealth, string> = {
  unknown: "API …",
  ok: "API live",
  waking: "API waking",
  offline: "API offline",
  error: "API error",
};

export function App() {
  const [api] = useState(() => createApiClient());
  const [log] = useState(() => createEventLog());
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [isTestLabOpen, setIsTestLabOpen] = useState(false);
  const [isDevtoolsOpen, setIsDevtoolsOpen] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const checkingRef = useRef(false);
  const lastLoggedHealthRef = useRef<ApiHealth>("unknown");
  const initialPullRef = useRef(false);

  const syncOptions = useMemo(
    () =>
      createBoardSyncOptions(api, {
        onSynced: () => log.add("sync", "success", "Outbox pushed to the API"),
        onSyncError: (error) =>
          log.add("sync", "error", `Push failed, retry scheduled: ${error.message}`),
      }),
    [api, log],
  );

  const sync = useSync<BoardState, BoardState>(STORAGE_KEY, syncOptions);
  const {
    data: syncData,
    update,
    refetch,
    applyRemoteState,
    isHydrating,
    isSyncing,
    isOffline,
    error,
  } = sync;

  const data = syncData ?? createEmptyBoard();

  const apiSnapshot = useSyncExternalStore(api.subscribe, api.getSnapshot);
  const logs = useSyncExternalStore(log.subscribe, log.getSnapshot);

  const runHealthCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setIsCheckingHealth(true);
    try {
      const ok = await api.checkHealth();
      if (ok) {
        if (lastLoggedHealthRef.current !== "ok") {
          log.add("api", "success", "API health check passed");
          lastLoggedHealthRef.current = "ok";
        }
      } else if (lastLoggedHealthRef.current !== "waking") {
        log.add("api", "warn", "API unreachable; retrying in the background");
        lastLoggedHealthRef.current = "waking";
      }
    } finally {
      checkingRef.current = false;
      setIsCheckingHealth(false);
    }
  }, [api, log]);

  useEffect(() => {
    log.add("local", "info", `Board “${api.boardId}” · client ${shortId(api.clientId)}`);
    log.add("local", "info", `API origin: ${import.meta.env.VITE_API_URL || window.location.origin}`);
    void runHealthCheck();

    const timer = window.setInterval(() => {
      if (api.getSnapshot().health !== "ok") void runHealthCheck();
    }, 12_000);

    return () => window.clearInterval(timer);
  }, [api, log, runHealthCheck]);

  useEffect(() => {
    if (isHydrating || initialPullRef.current) return;
    initialPullRef.current = true;
    log.add("api", "info", "Pulling the latest board…");
    void api
      .fetcher()
      .then((remote) => applyRemoteState(remote))
      .then(() => {
        log.add("api", "success", "Board loaded from the API");
      })
      .catch((fetchError: unknown) => {
        log.add(
          "api",
          "warn",
          `Initial board fetch failed: ${
            fetchError instanceof Error ? fetchError.message : String(fetchError)
          }`,
        );
      });
  }, [api, applyRemoteState, isHydrating, log]);

  useEffect(() => {
    setStreamState("connecting");
    const close = openBoardStream(api, {
      onOpen: () => {
        setStreamState("open");
        log.add("stream", "success", "SSE connected");
      },
      onError: () => {
        setStreamState("reconnecting");
        log.add("stream", "warn", "SSE disconnected; EventSource will reconnect");
      },
      onEvent: (event) => {
        log.add(
          "stream",
          "info",
          `${event.type} v${event.version}${event.updatedBy ? ` from ${shortId(event.updatedBy)}` : ""}`,
        );
        void applyRemoteState(event.state).catch((streamError: unknown) => {
          log.add(
            "stream",
            "error",
            `Could not apply remote state: ${
              streamError instanceof Error ? streamError.message : String(streamError)
            }`,
          );
        });
      },
    });

    return () => {
      close();
    };
  }, [api, applyRemoteState, log]);

  useEffect(() => {
    if (editingCardId !== null && !data.cards[editingCardId]) {
      setEditingCardId(null);
    }
  }, [data.cards, editingCardId]);

  const handleAddCard = useCallback(
    (columnId: string, title: string) => {
      update((draft) => {
        addCard(draft, columnId, title);
      });
      log.add("local", "info", `Added “${title}” to ${columnId}`);
    },
    [log, update],
  );

  const handleSaveCard = useCallback(
    (cardId: string, patch: { title: string; notes: string }) => {
      update((draft) => {
        editCard(draft, cardId, patch);
      });
      log.add("local", "info", `Updated “${patch.title}”`);
    },
    [log, update],
  );

  const handleDeleteCard = useCallback(
    (cardId: string) => {
      update((draft) => {
        deleteCard(draft, cardId);
      });
      setEditingCardId(null);
      log.add("local", "info", "Deleted a card");
    },
    [log, update],
  );

  const handleMoveCard = useCallback(
    (cardId: string, toColumnId: string, index: number) => {
      update((draft) => {
        moveCard(draft, cardId, toColumnId, index);
      });
      log.add("local", "info", `Moved a card to ${toColumnId}`);
    },
    [log, update],
  );

  const handleMoveBy = useCallback(
    (cardId: string, direction: -1 | 1) => {
      update((draft) => {
        moveCardBy(draft, cardId, direction);
      });
    },
    [update],
  );

  const handleMoveWithin = useCallback(
    (cardId: string, direction: -1 | 1) => {
      update((draft) => {
        moveCardWithinColumn(draft, cardId, direction);
      });
    },
    [update],
  );

  const handleMoveTo = useCallback(
    (cardId: string, columnId: string) => {
      update((draft) => {
        moveCardToColumn(draft, cardId, columnId);
      });
      log.add("local", "info", `Moved a card to ${columnId}`);
    },
    [log, update],
  );

  const handleReset = useCallback(async () => {
    const confirmed = window.confirm(
      "Reset the shared demo board for everyone? Pending offline edits in this tab will be replayed on top.",
    );
    if (!confirmed) return;
    try {
      const board = await api.reset();
      await applyRemoteState(board.state);
      log.add("api", "success", `Server board reset to v${board.version}`);
    } catch (resetError) {
      log.add(
        "api",
        "error",
        `Reset failed: ${resetError instanceof Error ? resetError.message : String(resetError)}`,
      );
    }
  }, [api, applyRemoteState, log]);

  const handleClearLocal = useCallback(() => {
    const confirmed = window.confirm(
      "Delete this origin's IndexedDB cache and reload? Unpushed edits in this tab will be lost.",
    );
    if (!confirmed) return;
    requestLocalCacheClear();
  }, []);

  const handleOpenSibling = useCallback(() => {
    window.open(siblingAppUrl("vue", api.boardId), "_blank", "noopener,noreferrer");
  }, [api.boardId]);

  const handleCloseDevtools = useCallback(() => setIsDevtoolsOpen(false), []);
  const handleCloseTestLab = useCallback(() => setIsTestLabOpen(false), []);

  const editingCard = editingCardId ? data.cards[editingCardId] : undefined;
  const editingColumn = editingCardId ? getColumnOf(data, editingCardId) : undefined;

  const healthTone =
    apiSnapshot.health === "ok"
      ? "ok"
      : apiSnapshot.health === "offline" || apiSnapshot.health === "error"
        ? "error"
        : "warn";
  const streamTone = streamState === "open" ? "ok" : streamState === "reconnecting" ? "warn" : "muted";
  const totalCards = Object.keys(data.cards).length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              S
            </span>
            <span className="brand__copy">
              <strong>Syncraft Kanban</strong>
              <span className="brand__sub">v0.9.0 reference app</span>
            </span>
          </div>

          <div className="app-header__status" aria-label="Connection status">
            <span className={`status status--${healthTone}`}>
              <span className="status__dot" aria-hidden="true" />
              {HEALTH_LABELS[apiSnapshot.health]}
            </span>
            <span className={`status status--${streamTone}`}>
              <span className="status__dot" aria-hidden="true" />
              {streamState === "open" ? "Live" : streamState === "reconnecting" ? "Reconnecting" : "Connecting"}
            </span>
            {isSyncing ? <span className="status status--syncing">Syncing…</span> : null}
            {isOffline ? <span className="status status--warn">Browser offline</span> : null}
          </div>

          <nav className="app-header__actions" aria-label="Demo actions">
            <a className="button button--ghost" href={siblingAppUrl("vue", api.boardId)}>
              Vue version ↗
            </a>
            <button type="button" className="button button--ghost" onClick={() => setIsTestLabOpen(true)}>
              Test Lab
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setIsDevtoolsOpen(true)}
            >
              Devtools
            </button>
            <button type="button" className="button button--ghost-danger" onClick={() => void handleReset()}>
              Reset
            </button>
          </nav>
        </div>
      </header>

      <div className="app-banners">
        <WakeBanner
          health={apiSnapshot.health}
          isChecking={isCheckingHealth}
          lastError={apiSnapshot.lastError}
          onRetry={() => void runHealthCheck()}
        />
        {error ? (
          <div className="notice notice--error" role="alert">
            <div>
              <strong>Sync issue.</strong> {error.message}
            </div>
            <button type="button" className="button button--secondary" onClick={() => void refetch()}>
              Retry fetch
            </button>
          </div>
        ) : null}
      </div>

      <main className="app-main">
        <div className="board-toolbar">
          <div>
            <p className="eyebrow">Board · {api.boardId}</p>
            <h1>Launch board</h1>
            <p className="board-toolbar__meta">
              {data.columns.length} columns · {totalCards} cards · v{apiSnapshot.version} ·{" "}
              {isHydrating ? "hydrating…" : `${apiSnapshot.metrics.pushes} pushes`}
              {apiSnapshot.metrics.duplicates > 0
                ? ` · ${apiSnapshot.metrics.duplicates} duplicate${apiSnapshot.metrics.duplicates === 1 ? "" : "s"} absorbed`
                : ""}
            </p>
          </div>
          <div className="board-toolbar__actions">
            <span className="board-toolbar__hint">
              {apiSnapshot.metrics.lastPushAt === null
                ? "No pushes yet"
                : `Last push ${formatRelativeTime(apiSnapshot.metrics.lastPushAt)}`}
            </span>
            <button type="button" className="button button--secondary" onClick={() => void refetch()}>
              Refresh
            </button>
          </div>
        </div>

        <KanbanBoard
          board={data}
          onAddCard={handleAddCard}
          onOpenCard={setEditingCardId}
          onMoveCard={handleMoveCard}
          onMoveBy={handleMoveBy}
          onMoveWithin={handleMoveWithin}
        />

        <footer className="app-footer">
          <span>
            Dogfooding <code>@syncraft-labs/core</code>, <code>@syncraft-labs/react</code>, Hono, and
            libSQL for issue #55.
          </span>
          <span>
            {isHydrating ? "Hydrating from IndexedDB…" : "Local-first · offline queue · SSE fan-out"}
          </span>
        </footer>
      </main>

      {editingCard ? (
        <CardDialog
          key={editingCard.id}
          card={editingCard}
          columns={data.columns}
          currentColumnId={editingColumn?.id}
          onSave={handleSaveCard}
          onDelete={handleDeleteCard}
          onMoveTo={handleMoveTo}
          onClose={() => setEditingCardId(null)}
        />
      ) : null}

      {isTestLabOpen ? (
        <TestLab
          api={api}
          networkMode={api.getNetworkMode()}
          failureMode={api.getFailureMode()}
          latency={api.getLatency()}
          onClose={handleCloseTestLab}
          onReset={() => void handleReset()}
          onClearLocal={handleClearLocal}
          onOpenSibling={handleOpenSibling}
          log={log}
        />
      ) : null}

      {isDevtoolsOpen ? (
        <DevtoolsPanel
          snapshot={apiSnapshot}
          sync={{
            isHydrating,
            isSyncing,
            isOffline,
            error: error?.message ?? null,
          }}
          logs={logs}
          boardId={api.boardId}
          clientId={api.clientId}
          onRefetch={() => void refetch()}
          onClearLog={() => log.clear()}
          onClose={handleCloseDevtools}
        />
      ) : null}
    </div>
  );
}
