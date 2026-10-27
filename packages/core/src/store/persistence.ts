import type { Patch } from "../produce/index.js";
import {
  STATE_ENTITIES_STORE,
  STATE_STORE,
  OUTBOX_STORE,
  STATE_KEY,
  type SyncDB,
} from "../storage/db.js";
import { withQuotaGuard, type QuotaExceededHandler } from "../storage/withQuotaGuard.js";
import type { OutboxEntry } from "../types.js";
import { encryptData } from "../crypto/index.js";
import { encryptEntities } from "../storage/collection.js";

interface CollectionDeltas {
  isFullRewrite: boolean;
  updatedEntities: Record<string, unknown>;
  deletedKeys: string[];
}

function extractCollectionDeltas<T>(nextState: T, patches: Patch[]): CollectionDeltas {
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
    } else if (nextState && typeof nextState === "object" && entityKey in (nextState as object)) {
      updatedEntities[entityKey] = (nextState as Record<string, unknown>)[entityKey];
      deletedKeysSet.delete(entityKey);
    }
  }

  return { isFullRewrite, updatedEntities, deletedKeys: Array.from(deletedKeysSet) };
}

export async function persistState<T>(
  db: SyncDB,
  storageMode: string,
  nextState: T,
  patches: Patch[],
  storageKey: string,
  onQuotaExceeded?: QuotaExceededHandler,
  outboxEntry?: OutboxEntry<T>,
  cryptoKey?: CryptoKey | null,
): Promise<void> {
  const op = async () => {
    let collectionData: {
      isFullRewrite: boolean;
      entriesToPut: [string, unknown][];
      deletedKeys: string[];
    } | null = null;
    let stateToStore: unknown = nextState;

    if (storageMode === "collection") {
      const deltas = extractCollectionDeltas(nextState, patches);
      if (deltas.isFullRewrite) {
        const full =
          nextState && typeof nextState === "object"
            ? (nextState as Record<string, unknown>)
            : {};
        const entriesToPut = await encryptEntities(full, cryptoKey);
        collectionData = { isFullRewrite: true, entriesToPut, deletedKeys: [] };
      } else if (Object.keys(deltas.updatedEntities).length > 0 || deltas.deletedKeys.length > 0) {
        const entriesToPut = await encryptEntities(deltas.updatedEntities, cryptoKey);
        collectionData = { isFullRewrite: false, entriesToPut, deletedKeys: deltas.deletedKeys };
      }
    } else {
      stateToStore = cryptoKey ? await encryptData(nextState, cryptoKey) : nextState;
    }

    const stateStoreName = storageMode === "collection" ? STATE_ENTITIES_STORE : STATE_STORE;
    const storeNames = outboxEntry ? [stateStoreName, OUTBOX_STORE] : [stateStoreName];
    const tx = db.transaction(storeNames, "readwrite");
    const stateStore = tx.objectStore(stateStoreName);
    const promises: Promise<unknown>[] = [];

    if (storageMode === "collection" && collectionData) {
      if (collectionData.isFullRewrite) {
        await stateStore.clear();
        for (const [key, entity] of collectionData.entriesToPut) {
          promises.push(stateStore.put(entity, key));
        }
      } else {
        for (const [key, value] of collectionData.entriesToPut) {
          promises.push(stateStore.put(value, key));
        }
        for (const key of collectionData.deletedKeys) {
          promises.push(stateStore.delete(key));
        }
      }
    } else if (storageMode !== "collection") {
      promises.push(stateStore.put(stateToStore, STATE_KEY));
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
