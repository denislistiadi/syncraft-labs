import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { ensureBoard, isValidBoardId, resetBoard } from "../board/repository.js";

export interface BoardRouteDependencies {
  readonly db: Client;
}

function invalidBoard(c: { json: (body: unknown, status: 400) => Response }): Response {
  return c.json({ error: "invalid_board_id", message: "Board IDs must match [A-Za-z0-9_-]{1,64}." }, 400);
}

export function registerBoardRoutes(app: Hono, deps: BoardRouteDependencies): void {
  app.get("/api/boards/:id", async (c) => {
    const boardId = c.req.param("id");
    if (!isValidBoardId(boardId)) return invalidBoard(c);

    const board = await ensureBoard(deps.db, boardId);
    return c.json(board);
  });

  app.post("/api/boards/:id/reset", async (c) => {
    const boardId = c.req.param("id");
    if (!isValidBoardId(boardId)) return invalidBoard(c);

    const board = await resetBoard(deps.db, boardId);
    return c.json({ ok: true, ...board });
  });
}
