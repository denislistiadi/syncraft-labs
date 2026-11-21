import type { Client } from "@libsql/client";
import { createSeedBoard } from "./seed.js";
import type { BoardRecord, BoardState } from "./types.js";

const BOARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const DEFAULT_BOARD_ID = "demo";

export function isValidBoardId(value: string): boolean {
  return BOARD_ID_PATTERN.test(value);
}

function parseState(raw: unknown): BoardState {
  return JSON.parse(String(raw)) as BoardState;
}

function toBoardRecord(row: Record<string, unknown>): BoardRecord {
  return {
    id: String(row.id),
    state: parseState(row.state),
    version: Number(row.version),
    updatedAt: Number(row.updated_at),
  };
}

export async function readBoard(db: Client, boardId: string): Promise<BoardRecord | null> {
  const result = await db.execute({
    sql: "SELECT id, state, version, updated_at FROM boards WHERE id = ?",
    args: [boardId],
  });

  const row = result.rows[0];
  return row ? toBoardRecord(row) : null;
}

export async function ensureBoard(db: Client, boardId: string): Promise<BoardRecord> {
  const existing = await readBoard(db, boardId);
  if (existing) return existing;

  const seed = JSON.stringify(createSeedBoard());
  const timestamp = Date.now();

  await db.execute({
    sql: `INSERT INTO boards (id, state, version, updated_at)
          VALUES (?, ?, 1, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [boardId, seed, timestamp],
  });

  const created = await readBoard(db, boardId);
  if (!created) {
    throw new Error(`Failed to create board "${boardId}"`);
  }
  return created;
}

export async function resetBoard(db: Client, boardId: string): Promise<BoardRecord> {
  const seed = JSON.stringify(createSeedBoard());
  const timestamp = Date.now();

  await ensureBoard(db, boardId);
  await db.execute({
    sql: `UPDATE boards
          SET state = ?, version = version + 1, updated_at = ?
          WHERE id = ?`,
    args: [seed, timestamp, boardId],
  });

  const reset = await readBoard(db, boardId);
  if (!reset) {
    throw new Error(`Failed to reset board "${boardId}"`);
  }
  return reset;
}
