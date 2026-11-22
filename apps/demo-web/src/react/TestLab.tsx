import type { ApiClient, FailureMode, NetworkMode } from "../shared/api.js";
import type { EventLog } from "../shared/log.js";

export interface TestLabProps {
  readonly api: ApiClient;
  readonly networkMode: NetworkMode;
  readonly failureMode: FailureMode;
  readonly latency: number;
  readonly onClose: () => void;
  readonly onReset: () => void;
  readonly onClearLocal: () => void;
  readonly onOpenSibling: () => void;
  readonly log: EventLog;
}

export function TestLab(props: TestLabProps) {
  const isOffline = props.networkMode === "offline";

  return (
    <div
      className="panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <aside className="panel panel--right" aria-label="Test Lab">
        <header className="panel__header">
          <div>
            <p className="eyebrow">Field testing</p>
            <h2>Test Lab</h2>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="Close Test Lab">
            ×
          </button>
        </header>

        <section className="panel__section">
          <h3>Connectivity</h3>
          <div className="segmented" role="group" aria-label="Network mode">
            <button
              type="button"
              className={`segmented__button${!isOffline ? " segmented__button--active" : ""}`}
              onClick={() => {
                props.api.setNetworkMode("online");
                props.log.add("test", "info", "Network mode: online");
              }}
            >
              Online
            </button>
            <button
              type="button"
              className={`segmented__button${isOffline ? " segmented__button--active" : ""}`}
              onClick={() => {
                props.api.setNetworkMode("offline");
                props.log.add("test", "warn", "Network mode: offline");
              }}
            >
              Offline
            </button>
          </div>
          <p className="panel__hint">
            Offline mode blocks every request without touching the browser connection. Add or
            move a card, then switch back to online and watch the outbox drain.
          </p>
        </section>

        <section className="panel__section">
          <h3>Failure injection</h3>
          <div className="panel__row">
            <button
              type="button"
              className="button button--secondary"
              disabled={props.failureMode === "permanent"}
              onClick={() => {
                props.api.failNextPush();
                props.log.add("test", "warn", "The next push will fail");
              }}
            >
              Fail next push
            </button>
            <label className="switch">
              <input
                type="checkbox"
                checked={props.failureMode === "permanent"}
                onChange={(event) => {
                  const mode: FailureMode = event.target.checked ? "permanent" : "none";
                  props.api.setFailureMode(mode);
                  props.log.add(
                    "test",
                    "warn",
                    mode === "permanent" ? "Permanent push failures enabled" : "Push failures disabled",
                  );
                }}
              />
              <span>Permanent</span>
            </label>
          </div>
          <p className="panel__hint">
            A failed push leaves the entry in the outbox. Syncraft retries with exponential
            backoff, so the change survives a flaky tunnel or a closed laptop lid.
          </p>
        </section>

        <section className="panel__section">
          <h3>Latency</h3>
          <label className="range">
            <span>{props.latency === 0 ? "No added delay" : `${props.latency} ms per request`}</span>
            <input
              type="range"
              min={0}
              max={3_000}
              step={250}
              value={props.latency}
              onChange={(event) => {
                const value = Number(event.target.value);
                props.api.setLatency(value);
                props.log.add("test", "info", `Latency set to ${value} ms`);
              }}
            />
          </label>
          <p className="panel__hint">
            Use 1–2 seconds of latency to see optimistic updates and the “Syncing” state before
            the API confirms the push.
          </p>
        </section>

        <section className="panel__section">
          <h3>Two tabs, one board</h3>
          <div className="panel__row">
            <button type="button" className="button button--secondary" onClick={props.onOpenSibling}>
              Open other framework
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                props.log.add("test", "info", "Copied this tab's URL");
              }}
            >
              Copy URL
            </button>
          </div>
          <p className="panel__hint">
            Each tab gets its own client ID in sessionStorage, so SSE updates flow both ways.
            Both tabs intentionally share the same IndexedDB storage key.
          </p>
        </section>

        <section className="panel__section">
          <h3>Destructive actions</h3>
          <div className="panel__stack">
            <button type="button" className="button button--danger-outline" onClick={props.onReset}>
              Reset server board
            </button>
            <button type="button" className="button button--danger-outline" onClick={props.onClearLocal}>
              Clear local cache
            </button>
          </div>
          <p className="panel__hint">
            Reset restores the seeded board for everyone. Clearing local cache closes this tab's
            IndexedDB and reloads from the server.
          </p>
        </section>
      </aside>
    </div>
  );
}
