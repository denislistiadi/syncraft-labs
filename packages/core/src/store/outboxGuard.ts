import { countOutbox, deleteOldestOutboxEntry } from "../storage.js";
import type { SyncDB } from "../storage/db.js";
import type { OutboxOverflowStrategy } from "../types/config.js";

export async function enforceOutboxLimit(
  db: SyncDB,
  storageKey: string,
  maxOutboxSize: number,
  overflowStrategy: OutboxOverflowStrategy,
  onOverflow: ((info: { storageKey: string; outboxSize: number; maxOutboxSize: number; strategy: OutboxOverflowStrategy }) => void | Promise<void>) | undefined,
): Promise<void> {
  const outboxSize = await countOutbox(db);
  if (outboxSize < maxOutboxSize) return;
  if (overflowStrategy === "dropOldest") {
    await deleteOldestOutboxEntry(db);
    console.warn(`[Syncraft Labs] Outbox size limit reached (${maxOutboxSize}) for store "${storageKey}". Oldest outbox entry dropped per "dropOldest" strategy.`);
    if (onOverflow) await onOverflow({ storageKey, outboxSize, maxOutboxSize, strategy: "dropOldest" });
  } else if (overflowStrategy === "forceFlush") {
    if (onOverflow) await onOverflow({ storageKey, outboxSize, maxOutboxSize, strategy: "forceFlush" });
    const newSize = await countOutbox(db);
    if (newSize >= maxOutboxSize) throw new Error(`[Syncraft Labs] Outbox size limit reached (${maxOutboxSize}) for store "${storageKey}". Force flush did not free enough space before write.`);
  } else {
    if (onOverflow) await onOverflow({ storageKey, outboxSize, maxOutboxSize, strategy: "reject" });
    throw new Error(`[Syncraft Labs] Outbox size limit reached (${maxOutboxSize}) for store "${storageKey}". Sync pending changes before making more mutations.`);
  }
}
