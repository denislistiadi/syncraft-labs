import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { ensureBoard, isValidBoardId, resetBoard } from "../board/repository.js";
import type { BoardHub } from "../realtime/hub.js";

export interface BoardRouteDependencies {
  readonly db: Client;
  readonly hub: BoardHub;
}

export function registerBoardRoutes(app: Hono, deps: BoardRouteDependencies): void {
  app.get("/api/boards/:id", async (c) => {
    const boardId = c.req.param("id");
    if (!isValidBoardId(boardId)) {
      return c.json({ error: "invalid_board_id" }, 400);
    }

    const board = await ensureBoard(deps.db, boardId);
    return c.json(board);
  });

  app.post("/api/boards/:id/reset", async (c) => {
    const boardId = c.req.param("id");
    if (!isValidBoardId(boardId)) {
      return c.json({ error: "invalid_board_id" }, 400);
    }

    const board = await resetBoard(deps.db, boardId);
    await deps.hub.publish({
      type: "reset",
      boardId,
      version: board.version,
      updatedAt: board.updatedAt,
      updatedBy: "reset",
      state: board.state,
    });

    return c.json({ ok: true, ...board });
  });
}
