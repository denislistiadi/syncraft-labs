import type { ApiSnapshot } from "../shared/api.js";
import { formatClock, formatRelativeTime } from "../shared/format.js";
import type { LogEntry } from "../shared/log.js";
import { shortId } from "../shared/ui.js";

export interface DevtoolsSyncState {
  readonly isHydrating: boolean;
  readonly isSyncing: boolean;
  readonly isOffline: boolean;
  readonly error: string | null;
}

export interface DevtoolsPanelProps {
  readonly snapshot: ApiSnapshot;
  readonly sync: DevtoolsSyncState;
  readonly logs: readonly LogEntry[];
  readonly boardId: string;
  readonly clientId: string;
  readonly onRefetch: () => void;
  readonly onClearLog: () => void;
  readonly onClose: () => void;
}

export function DevtoolsPanel(props: DevtoolsPanelProps) {
  const { metrics } = props.snapshot;

  return (
    <div
      className="panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <aside className="panel panel--right panel--wide" aria-label="Sync devtools">
        <header className="panel__header">
          <div>
            <p className="eyebrow">Observability</p>
            <h2>Sync devtools</h2>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="Close devtools">
            ×
          </button>
        </header>

        <section className="panel__section">
          <h3>API counters</h3>
          <dl className="metrics">
            <div>
              <dt>Fetches</dt>
              <dd>{metrics.fetches}</dd>
            </div>
            <div>
              <dt>Pushes</dt>
              <dd>{metrics.pushes}</dd>
            </div>
            <div>
              <dt>Duplicates</dt>
              <dd>{metrics.duplicates}</dd>
            </div>
            <div>
              <dt>Failures</dt>
              <dd>{metrics.failures}</dd>
            </div>
            <div>
              <dt>Last latency</dt>
              <dd>{metrics.lastLatencyMs === null ? "—" : `${metrics.lastLatencyMs} ms`}</dd>
            </div>
            <div>
              <dt>Last push</dt>
              <dd>{formatRelativeTime(metrics.lastPushAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="panel__section">
          <h3>Session</h3>
          <dl className="metrics metrics--dense">
            <div>
              <dt>Board</dt>
              <dd>{props.boardId}</dd>
            </div>
            <div>
              <dt>Client</dt>
              <dd title={props.clientId}>{shortId(props.clientId)}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>v{props.snapshot.version}</dd>
            </div>
            <div>
              <dt>Health</dt>
              <dd>{props.snapshot.health}</dd>
            </div>
          </dl>
          <div className="badge-row">
            {props.sync.isHydrating ? <span className="badge badge--info">hydrating</span> : null}
            {props.sync.isSyncing ? <span className="badge badge--info">syncing</span> : null}
            {props.sync.isOffline ? <span className="badge badge--warn">browser offline</span> : null}
            {props.sync.error ? (
              <span className="badge badge--error" title={props.sync.error}>
                sync error
              </span>
            ) : null}
            {!props.sync.isHydrating && !props.sync.isSyncing && !props.sync.error ? (
              <span className="badge badge--ok">idle</span>
            ) : null}
          </div>
          {props.snapshot.lastError ? (
            <p className="panel__error">{props.snapshot.lastError}</p>
          ) : null}
          <div className="panel__row">
            <button type="button" className="button button--secondary" onClick={props.onRefetch}>
              Refetch board
            </button>
            <button type="button" className="button button--ghost" onClick={props.onClearLog}>
              Clear log
            </button>
          </div>
        </section>

        <section className="panel__section panel__section--grow">
          <h3>Event log</h3>
          {props.logs.length === 0 ? (
            <p className="panel__hint">No events yet.</p>
          ) : (
            <ol className="log-list">
              {props.logs.map((entry) => (
                <li key={entry.id} className={`log-entry log-entry--${entry.level}`}>
                  <span className="log-entry__time" title={new Date(entry.at).toISOString()}>
                    {formatClock(entry.at)}
                  </span>
                  <span className="log-entry__source">{entry.source}</span>
                  <span className="log-entry__message">{entry.message}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
