import { createContext, useContext, useRef, type ReactNode } from "react";
import type { SyncStore } from "@syncraft-labs/core";

export type StoreRegistry = Map<string, SyncStore<never>>;

export const SyncraftContext = createContext<StoreRegistry | null>(null);

export interface SyncraftProviderProps {
  children: ReactNode;
}

/**
 * Provider component for Syncraft Labs.
 * Must wrap any component that uses `useSync` or `useSyncSuspense`.
 * Ensures that stores are scoped to the React component tree (safe for SSR).
 */
export function SyncraftProvider({ children }: SyncraftProviderProps) {
  const registryRef = useRef<StoreRegistry | null>(null);
  if (!registryRef.current) {
    registryRef.current = new Map();
  }

  return (
    <SyncraftContext.Provider value={registryRef.current}>
      {children}
    </SyncraftContext.Provider>
  );
}

/**
 * Internal hook to access the store registry.
 * @internal
 */
export function useStoreRegistry(): StoreRegistry {
  const context = useContext(SyncraftContext);
  if (!context) {
    throw new Error(
      "[Syncraft Labs] useSync must be used within a <SyncraftProvider>. " +
      "Please wrap your application in a SyncraftProvider."
    );
  }
  return context;
}
