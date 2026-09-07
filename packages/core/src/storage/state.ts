import type { SyncDB } from "./db.js";
import { STATE_STORE, STATE_KEY } from "./db.js";

export async function readState<T>(db: SyncDB): Promise<T | undefined> {
  const value = await db.get(STATE_STORE, STATE_KEY);
  return value as T | undefined;
}

export async function writeState<T>(db: SyncDB, value: T): Promise<void> {
  await db.put(STATE_STORE, value, STATE_KEY);
}
