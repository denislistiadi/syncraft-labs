import React from "react";
import { SyncraftProvider } from "@syncraft-labs/react";
import { PlaygroundInner } from "./PlaygroundInner.js";
import { PlaygroundFallback } from "./Fallback.js";
import styles from "./styles/Layout.module.css";

export default function PlaygroundApp() {
  return (
    <div className={styles.pageWrapper}>
      <SyncraftProvider>
        <React.Suspense fallback={<PlaygroundFallback />}>
          <PlaygroundInner />
        </React.Suspense>
      </SyncraftProvider>
    </div>
  );
}

export { PlaygroundInner } from "./PlaygroundInner.js";
export { StatusBadge } from "./StatusBadge.js";
export { DevTools } from "./DevTools.js";
export { PlaygroundFallback } from "./Fallback.js";
export type { Todo, TodoState } from "./types.js";
export { fetcher, pusher } from "./mocks.js";
