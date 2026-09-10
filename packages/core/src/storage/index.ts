export { openSyncDB, closeDB, type SyncDB, DB_PREFIX, DB_VERSION, STATE_STORE, STATE_ENTITIES_STORE, OUTBOX_STORE, STATE_KEY } from "./db.js";
export { readState, writeState } from "./state.js";
export { readCollectionState, writeCollectionEntities, writeCollectionState } from "./collection.js";
export { pushOutbox, readOutbox, countOutbox, deleteOldestOutboxEntry, clearOutbox } from "./outbox.js";
export { isQuotaExceededError } from "./quota.js";
export { withQuotaGuard, type QuotaExceededInfo, type QuotaExceededHandler } from "./withQuotaGuard.js";

