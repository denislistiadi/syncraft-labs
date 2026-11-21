import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { isValidBoardId } from "../board/repository.js";
import { getPushStats } from "../stats/repository.js";

export interface StatsRouteDependencies {
  readonly db: Client;
}

export function registerStatsRoutes(app: Hono, deps: StatsRouteDependencies): void {
  app.get("/api/stats", async (c) => {
    const boardId = c.req.query("boardId") ?? null;
    if (boardId !== null && !isValidBoardId(boardId)) {
      return c.json({ error: "invalid_board_id" }, 400);
    }
    return c.json(await getPushStats(deps.db, boardId));
  });

  app.get("/api/boards/:id/stats", async (c) => {
    const boardId = c.req.param("id");
    if (!isValidBoardId(boardId)) {
      return c.json({ error: "invalid_board_id" }, 400);
    }
    return c.json(await getPushStats(deps.db, boardId));
  });
}
