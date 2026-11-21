import { applyPatches } from "@syncraft-labs/core";
import type { Client, Transaction } from "@libsql/client";
import { ensureBoard } from "../board/repository.js";
import type { BoardRecord, BoardState } from "../board/types.js";
import type { SyncPayload } from "./types.js";

export interface SyncResult {
  readonly board: BoardRecord;
  readonly duplicate: boolean;
  readonly appliedPatches: number;
}

export class SyncConflictError extends Error {
  constructor(boardId: string) {
    super(`Board "${boardId}" changed while the sync was being applied.`);
    this.name = "SyncConflictError";
  }
}

async function readBoardInTransaction(tx: Transaction, boardId: string): Promise<BoardRecord | null> {
  const result = await tx.execute({
    sql: "SELECT id, state, version, updated_at FROM boards WHERE id = ?",
    args: [boardId],
  });
  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    state: JSON.parse(String(row.state)) as BoardState,
    version: Number(row.version),
    updatedAt: Number(row.updated_at),
  };
}

async function logPush(
  tx: Transaction,
  boardId: string,
  payload: SyncPayload,
  duplicate: boolean,
  patchCount: number,
  timestamp: number,
): Promise<void> {
  await tx.execute({
    sql: `INSERT INTO push_log
          (board_id, client_id, entry_id, idem_key, duplicate, patch_count, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      boardId,
      payload.clientId,
      payload.entries[0]?.id ?? "",
      payload.idempotencyKey,
      duplicate ? 1 : 0,
      patchCount,
      timestamp,
    ],
  });
}

/**
 * Applies all patches in one write transaction.
 *
 * The `sync_keys` insert doubles as the idempotency guard: a retried request
 * with the same key is logged as a duplicate and returns the current board
 * without incrementing the version. The board update is also guarded by the
 * version that was read inside the transaction, so concurrent writers cannot
 * silently overwrite each other.
 */
export async function applySync(
  db: Client,
  boardId: string,
  payload: SyncPayload,
): Promise<SyncResult> {
  // Make sure the row exists before opening the write transaction.
  await ensureBoard(db, boardId);

  const tx = await db.transaction("write");
  const now = Date.now();

  try {
    const existing = await tx.execute({
      sql: "SELECT 1 FROM sync_keys WHERE board_id = ? AND idem_key = ?",
      args: [boardId, payload.idempotencyKey],
    });

    if (existing.rows.length > 0) {
      const board = await readBoardInTransaction(tx, boardId);
      if (!board) throw new Error(`Board "${boardId}" disappeared during sync.`);
      await logPush(tx, boardId, payload, true, 0, now);
      await tx.commit();
      return { board, duplicate: true, appliedPatches: 0 };
    }

    const board = await readBoardInTransaction(tx, boardId);
    if (!board) throw new Error(`Board "${boardId}" disappeared during sync.`);

    const patches = payload.entries.flatMap((entry) => entry.patches);
    const nextState = applyPatches(board.state, patches);
    const nextVersion = board.version + 1;

    const update = await tx.execute({
      sql: `UPDATE boards
            SET state = ?, version = ?, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [JSON.stringify(nextState), nextVersion, now, boardId, board.version],
    });

    if (update.rowsAffected !== 1) {
      throw new SyncConflictError(boardId);
    }

    await tx.execute({
      sql: "INSERT INTO sync_keys (board_id, idem_key, client_id, created_at) VALUES (?, ?, ?, ?)",
      args: [boardId, payload.idempotencyKey, payload.clientId, now],
    });
    await logPush(tx, boardId, payload, false, patches.length, now);
    await tx.commit();

    return {
      board: {
        id: board.id,
        state: nextState,
        version: nextVersion,
        updatedAt: now,
      },
      duplicate: false,
      appliedPatches: patches.length,
    };
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
}
