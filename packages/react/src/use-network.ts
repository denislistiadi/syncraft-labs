/**
 * @module @syncraft-labs/react/use-network
 *
 * Hook for tracking browser network status and triggering sync on reconnect.
 */

import { useState, useEffect } from "react";
import type { ReactStoreController } from "./controller.js";

/**
 * Tracks online and offline network status in the browser.
 * Triggers background sync automatically when connectivity returns.
 *
 * @param controller - The active React store controller instance.
 * @returns `true` if browser is offline, otherwise `false`.
 */
export function useNetworkStatus(controller: ReactStoreController<any>): boolean {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOffline(false);
      controller.triggerSync();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [controller]);

  return isOffline;
}
