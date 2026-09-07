import type { SyncListener } from "../types/index.js";

export function createNotifier<T>() {
  const listeners = new Set<SyncListener<T>>();
  function notify(state: T): void {
    listeners.forEach((l) => l(state));
  }
  function subscribe(listener: SyncListener<T>): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return { listeners, notify, subscribe };
}
