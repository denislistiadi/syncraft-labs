import type { Patch } from "../produce/index.js";
import { STATE_ENTITIES_STORE, STATE_STORE, OUTBOX_STORE, STATE_KEY, type SyncDB } from "../storage/db.js";
import { withQuotaGuard, type QuotaExceededHandler } from "../storage/withQuotaGuard.js";
import type { OutboxEntry } from "../types.js";

export async function persistState<T>(
  db: SyncDB,
  storageMode: string,
  nextState: T,
  patches: Patch[],
  storageKey: string,
  onQuotaExceeded?: QuotaExceededHandler,
  outboxEntry?: OutboxEntry<T>,
): Promise<void> {
  const op = async () => {
    const stateStoreName = storageMode === "collection" ? STATE_ENTITIES_STORE : STATE_STORE;
    const storeNames = outboxEntry ? [stateStoreName, OUTBOX_STORE] : [stateStoreName];
    const tx = db.transaction(storeNames, "readwrite");
    const stateStore = tx.objectStore(stateStoreName);
    const promises: Promise<unknown>[] = [];

    if (storageMode === "collection") {
      let isFullRewrite = false;
      const updatedEntities: Record<string, unknown> = {};
      const deletedKeysSet = new Set<string>();
      for (const patch of patches) {
        if (patch.path.length === 0) {
          isFullRewrite = true;
          break;
        }
        const entityKey = String(patch.path[0]);
        if (patch.op === "remove" && patch.path.length === 1) {
          deletedKeysSet.add(entityKey);
          delete updatedEntities[entityKey];
        } else {
          if (nextState && typeof nextState === "object" && entityKey in (nextState as object)) {
            updatedEntities[entityKey] = (nextState as Record<string, unknown>)[entityKey];
            deletedKeysSet.delete(entityKey);
          }
        }
      }
      if (isFullRewrite) {
        await stateStore.clear();
        if (nextState && typeof nextState === "object") {
          for (const [key, entity] of Object.entries(nextState as Record<string, unknown>)) {
            promises.push(stateStore.put(entity, key));
          }
        }
      } else if (Object.keys(updatedEntities).length > 0 || deletedKeysSet.size > 0) {
        for (const [key, value] of Object.entries(updatedEntities)) promises.push(stateStore.put(value, key));
        for (const key of Array.from(deletedKeysSet)) promises.push(stateStore.delete(key));
      }
    } else {
      promises.push(stateStore.put(nextState, STATE_KEY));
    }

    if (outboxEntry) {
      const outboxStore = tx.objectStore(OUTBOX_STORE);
      promises.push(outboxStore.put(outboxEntry));
    }

    promises.push(tx.done);
    await Promise.all(promises);
  };

  await withQuotaGuard(
    op,
    { storageKey, operation: "persistState" },
    onQuotaExceeded,
  );
}
