import { assertNoCycles, deepFreeze, isDevMode, validateStateShape } from "../guards/index.js";

export function createBroadcaster<T>(
  storageKey: string,
  setState: (s: T | undefined) => void,
  notify: (s: T) => void,
): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  const channel = new BroadcastChannel(`syncraft-${storageKey}`);
  channel.onmessage = (event) => {
    if (event.data?.type === "SYNCRAFT_STATE_UPDATE") {
      const snapshot = event.data.snapshot as T | undefined;
      if (snapshot !== undefined && isDevMode()) {
        assertNoCycles(snapshot, `BroadcastChannel sync for store "${storageKey}"`);
        validateStateShape(snapshot, `BroadcastChannel sync for store "${storageKey}"`);
      }
      const next = snapshot !== undefined && isDevMode() ? deepFreeze(snapshot) : snapshot;
      setState(next);
      if (next !== undefined) notify(next);
    }
  };
  return channel;
}
