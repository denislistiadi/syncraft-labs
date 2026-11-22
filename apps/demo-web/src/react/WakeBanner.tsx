import type { ApiHealth } from "../shared/api.js";

export interface WakeBannerProps {
  readonly health: ApiHealth;
  readonly isChecking: boolean;
  readonly lastError: string | null;
  readonly onRetry: () => void;
}

export function WakeBanner(props: WakeBannerProps) {
  if (props.health === "ok" || props.health === "unknown") return null;

  const isWaking = props.health === "waking";
  const isOffline = props.health === "offline";

  return (
    <div className={`wake-banner${isOffline ? " wake-banner--offline" : ""}`} role="status">
      <span className={`spinner${props.isChecking ? "" : " spinner--paused"}`} aria-hidden="true" />
      <div className="wake-banner__copy">
        <strong>
          {isOffline
            ? "You are offline."
            : isWaking
              ? "Waking the free Render API."
              : "The API is not responding."}
        </strong>
        <span>
          {isOffline
            ? "Edits stay in the outbox and will sync when the network returns."
            : isWaking
              ? "Free instances sleep after 15 minutes. The first request can take up to a minute."
              : props.lastError ?? "Check the Render dashboard, then retry."}
        </span>
      </div>
      {!isOffline ? (
        <button
          type="button"
          className="button button--secondary"
          onClick={props.onRetry}
          disabled={props.isChecking}
        >
          {props.isChecking ? "Checking…" : "Retry now"}
        </button>
      ) : null}
    </div>
  );
}
