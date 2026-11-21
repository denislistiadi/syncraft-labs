/**
 * SQLite schema for the reference backend.
 *
 * The schema is intentionally small: one JSON document per board, an
 * idempotency ledger, and an append-only push log used by the field-testing
 * statistics endpoint.
 */
import type { Client } from "@libsql/client";

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_keys (
    board_id TEXT NOT NULL,
    idem_key TEXT NOT NULL,
    client_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (board_id, idem_key)
  )`,
  `CREATE TABLE IF NOT EXISTS push_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    idem_key TEXT NOT NULL,
    duplicate INTEGER NOT NULL DEFAULT 0,
    patch_count INTEGER NOT NULL DEFAULT 0,
    received_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_log_board_received
    ON push_log (board_id, received_at)`,
  `CREATE INDEX IF NOT EXISTS idx_push_log_client
    ON push_log (client_id, received_at)`,
];

export async function migrateDatabase(db: Client): Promise<void> {
  await db.batch([...SCHEMA_STATEMENTS], "write");
}
