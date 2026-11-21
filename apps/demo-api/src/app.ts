import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { BoardHub } from "./realtime/hub.js";
import { registerBoardRoutes } from "./routes/boards.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { registerSyncRoutes } from "./routes/sync.js";

export interface AppDependencies {
  /** libSQL client. Tests inject a temporary SQLite file. */
  readonly db: Client;
  /** Optional hub override, useful in tests. */
  readonly hub?: BoardHub;
  /** Version string exposed by `/health`. */
  readonly version?: string;
}

/**
 * Creates the Hono application.
 *
 * Dependencies are injected so tests can use an isolated database and a fake
 * clock without booting the HTTP listener.
 */
export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();
  const hub = deps.hub ?? new BoardHub();
  const version = deps.version ?? "0.9.0";

  app.get("/", (c) =>
    c.json({
      name: "syncraft-demo-api",
      version,
      health: "/health",
      boards: "/api/boards/:id",
      sync: "/api/boards/:id/sync",
      stream: "/api/boards/:id/stream",
      stats: "/api/stats?boardId=demo",
    }),
  );

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "syncraft-demo-api",
      version,
      uptime: Math.round(process.uptime()),
    }),
  );

  registerBoardRoutes(app, { db: deps.db, hub });
  registerSyncRoutes(app, { db: deps.db, hub });
  registerStreamRoutes(app, { db: deps.db, hub });
  registerStatsRoutes(app, { db: deps.db });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((error, c) => {
    console.error("[demo-api] unhandled error", error);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
