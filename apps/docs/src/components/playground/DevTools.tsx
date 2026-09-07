import styles from "./styles/DevTools.module.css";
import type { TodoState } from "./types.js";

export function DevTools({ data, isSyncing, isHydrating, isOffline }: { data: TodoState | undefined; isSyncing: boolean; isHydrating: boolean; isOffline: boolean }) {
  const syntaxHighlight = (json: string) => {
    return json
      .replace(/"([^"]+)":/g, `<span class="${styles.syntaxKey}">"$1"</span>:`)
      .replace(/: (true|false)/g, `: <span class="${styles.syntaxBool}">$1</span>`);
  };

  return (
    <div className={styles.devTools}>
      <div className={styles.devToolsHeader}>
        <div className={styles.devToolsTitle}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span>Store Inspector</span>
        </div>
        <div className={styles.devToolsStatus}>
          <span className={styles.devToolsStatusLabel}>Status</span>
          {isHydrating && <span className={styles.statusDotBlue} title="Hydrating" />}
          {isSyncing && <span className={styles.statusDotAmber} title="Syncing" />}
          {isOffline && <span className={styles.statusDotRed} title="Offline" />}
          {!isOffline && !isSyncing && !isHydrating && <span className={styles.statusDotGreen} title="Idle" />}
        </div>
      </div>
      <div className={styles.devToolsBody}>
        {data ? (
          <pre
            dangerouslySetInnerHTML={{
              __html: `<span class="${styles.syntaxKeyword}">const</span> storeState <span class="${styles.syntaxKeyword}">=</span> ` + syntaxHighlight(JSON.stringify(data, null, 2)),
            }}
          />
        ) : (
          <div className={styles.devToolsEmpty}>No data available</div>
        )}
      </div>
      <div className={styles.devToolsFooter}>
        <span>Powered by IndexedDB</span>
        <span className={styles.devToolsBadge}>O(1) Drafts</span>
      </div>
    </div>
  );
}
