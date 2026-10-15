import headerStyles from "./styles/Header.module.css";
import { StatusBadge } from "./StatusBadge.js";

interface TaskHeaderProps {
  isOffline: boolean;
  isSyncing: boolean;
  onRefresh: () => void;
}

export function TaskHeader({ isOffline, isSyncing, onRefresh }: TaskHeaderProps) {
  return (
    <header className={headerStyles.header}>
      <div>
        <h2 className={headerStyles.headerTitle}>Tasks</h2>
        <p className={headerStyles.headerSubtitle}>Manage your local-first tasks efficiently.</p>
      </div>
      <div className={headerStyles.headerActions}>
        <StatusBadge isOffline={isOffline} isSyncing={isSyncing} />
        <button
          onClick={onRefresh}
          disabled={isSyncing}
          className={headerStyles.refreshButton}
          title="Refresh data"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
  );
}
