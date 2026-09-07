import type { Patch } from "../produce/index.js";
import { writeState, writeCollectionState, writeCollectionEntities } from "../storage.js";
import type { SyncDB } from "../storage/db.js";

export async function persistState<T>(db: SyncDB, storageMode: string, nextState: T, patches: Patch[]): Promise<void> {
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
    if (isFullRewrite) await writeCollectionState(db, nextState);
    else if (Object.keys(updatedEntities).length > 0 || deletedKeysSet.size > 0) await writeCollectionEntities(db, updatedEntities, Array.from(deletedKeysSet));
  } else {
    await writeState(db, nextState);
  }
}
