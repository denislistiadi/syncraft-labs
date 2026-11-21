import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { registerBoardRoutes } from "./routes/boards.js";
import { registerSyncRoutes } from "./routes/sync.js";

export interface AppDependencies {
  /** libSQL client. Tests inject a temporary SQLite file. */
  readonly db: Client;
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
  const version = deps.version ?? "0.9.0";

  app.get("/", (c) =>
    c.json({
      name: "syncraft-demo-api",
      version,
      health: "/health",
      boards: "/api/boards/:id",
      sync: "/api/boards/:id/sync",
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

  registerBoardRoutes(app, { db: deps.db });
  registerSyncRoutes(app, { db: deps.db });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((error, c) => {
    console.error("[demo-api] unhandled error", error);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
