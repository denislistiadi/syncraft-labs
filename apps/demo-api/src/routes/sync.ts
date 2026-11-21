import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { isValidBoardId } from "../board/repository.js";
import type { BoardHub } from "../realtime/hub.js";
import { applySync, SyncConflictError } from "../sync/service.js";
import { parseSyncRequest } from "../sync/validate.js";

export interface SyncRouteDependencies {
  readonly db: Client;
  readonly hub: BoardHub;
}

export function registerSyncRoutes(app: Hono, deps: SyncRouteDependencies): void {
  app.post("/api/boards/:id/sync", async (c) => {
    const boardId = c.req.param("id");
    if (!isValidBoardId(boardId)) {
      return c.json({ error: "invalid_board_id" }, 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", message: "Request body must be valid JSON." }, 400);
    }

    const parsed = parseSyncRequest(body, {
      clientId: c.req.header("x-client-id"),
      idempotencyKey: c.req.header("x-idempotency-key"),
    });

    if ("error" in parsed) {
      return c.json({ error: parsed.error, message: parsed.message }, 400);
    }

    try {
      const result = await applySync(deps.db, boardId, parsed.payload);

      if (!result.duplicate && result.appliedPatches > 0) {
        await deps.hub.publish({
          type: "update",
          boardId,
          version: result.board.version,
          updatedAt: result.board.updatedAt,
          updatedBy: parsed.payload.clientId,
          state: result.board.state,
        });
      }

      return c.json({
        ok: true,
        boardId,
        version: result.board.version,
        updatedAt: result.board.updatedAt,
        state: result.board.state,
        duplicate: result.duplicate,
        appliedPatches: result.appliedPatches,
      });
    } catch (error) {
      if (error instanceof SyncConflictError) {
        return c.json(
          { error: "version_conflict", message: "Reload the board and retry." },
          409,
        );
      }
      throw error;
    }
  });
}
