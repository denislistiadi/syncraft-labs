import type { SyncDB } from "./db.js";
import { META_STORE } from "./db.js";

const SCHEMA_VERSION_KEY = "schema_version";

interface SchemaVersionRecord {
  readonly version: number;
}

export async function readSchemaVersion(db: SyncDB): Promise<number | undefined> {
  const record = (await db.get(META_STORE, SCHEMA_VERSION_KEY)) as
    | SchemaVersionRecord
    | undefined;
  return typeof record?.version === "number" ? record.version : undefined;
}

export async function writeSchemaVersion(db: SyncDB, version: number): Promise<void> {
  await db.put(META_STORE, { version } satisfies SchemaVersionRecord, SCHEMA_VERSION_KEY);
}

export async function clearSchemaVersion(db: SyncDB): Promise<void> {
  await db.delete(META_STORE, SCHEMA_VERSION_KEY);
}
