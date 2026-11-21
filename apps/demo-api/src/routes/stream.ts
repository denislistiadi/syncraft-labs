import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ensureBoard, isValidBoardId } from "../board/repository.js";
import type { BoardEvent, BoardHub } from "../realtime/hub.js";

export const SSE_HEARTBEAT_MS = 15_000;

export interface StreamRouteDependencies {
  readonly db: Client;
  readonly hub: BoardHub;
}

export function registerStreamRoutes(app: Hono, deps: StreamRouteDependencies): void {
  app.get("/api/boards/:id/stream", async (c) => {
    const boardId = c.req.param("id");
    if (!isValidBoardId(boardId)) {
      return c.json({ error: "invalid_board_id" }, 400);
    }

    const initial = await ensureBoard(deps.db, boardId);
    const clientId = c.req.query("clientId") ?? "anonymous";

    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");

    return streamSSE(c, async (stream) => {
      let closed = false;

      const writeEvent = async (event: string, data: unknown): Promise<void> => {
        if (closed) return;
        try {
          await stream.writeSSE({ event, data: JSON.stringify(data) });
        } catch {
          closed = true;
        }
      };

      const unsubscribe = deps.hub.subscribe(boardId, async (event: BoardEvent) => {
        await writeEvent(event.type, event);
      });

      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });

      await writeEvent("hello", {
        boardId,
        clientId,
        version: initial.version,
        updatedAt: initial.updatedAt,
        state: initial.state,
      });

      try {
        while (!closed) {
          await stream.sleep(SSE_HEARTBEAT_MS);
          if (!closed) {
            await writeEvent("heartbeat", { at: Date.now() });
          }
        }
      } finally {
        unsubscribe();
      }
    });
  });
}
