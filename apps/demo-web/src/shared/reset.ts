import { LOCAL_DB_PREFIX, STORAGE_KEY } from "./config.js";

export const CLEAR_CACHE_FLAG = "syncraft-kanban-clear-cache";

/**
 * Asks the next page load to delete this app's IndexedDB database before the
 * store opens it. Deleting from the live page would be blocked by the open
 * connection, so the actual work happens during bootstrap.
 */
export function requestLocalCacheClear(): void {
  window.sessionStorage.setItem(CLEAR_CACHE_FLAG, "1");
  window.location.reload();
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    const finish = (): void => resolve();
    request.onsuccess = finish;
    request.onerror = finish;
    request.onblocked = finish;
    window.setTimeout(finish, 2_000);
  });
}

/** Call before mounting the app. Safe when no clear was requested. */
export async function applyPendingCacheClear(): Promise<void> {
  try {
    if (window.sessionStorage.getItem(CLEAR_CACHE_FLAG) !== "1") return;
    window.sessionStorage.removeItem(CLEAR_CACHE_FLAG);
    await deleteDatabase(`${LOCAL_DB_PREFIX}${STORAGE_KEY}`);
  } catch {
    // Private browsing modes may block IndexedDB entirely; mounting still works.
  }
}
