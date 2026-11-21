import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { clientKey, rateLimit } from "./middleware/rate-limit.js";
import { BoardHub } from "./realtime/hub.js";
import { registerBoardRoutes } from "./routes/boards.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { registerSyncRoutes } from "./routes/sync.js";

const DEFAULT_SYNC_BODY_LIMIT = 1_024 * 1_024;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

export interface AppDependencies {
  /** libSQL client. Tests inject a temporary SQLite file. */
  readonly db: Client;
  /** Optional hub override, useful in tests. */
  readonly hub?: BoardHub;
  /** Version string exposed by `/health`. */
  readonly version?: string;
  /** Allowed browser origins. `["*"]` keeps the demo usable from any preview URL. */
  readonly corsOrigins?: readonly string[];
  /** Maximum write requests per IP per minute. */
  readonly rateLimitMax?: number;
}

function resolveCorsOrigin(
  requestOrigin: string,
  allowedOrigins: readonly string[],
): string | undefined {
  if (allowedOrigins.includes("*")) return "*";
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : undefined;
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
  const corsOrigins = deps.corsOrigins ?? ["*"];
  const rateLimitMax = deps.rateLimitMax ?? 120;

  app.use(
    "*",
    cors({
      origin: (origin) => resolveCorsOrigin(origin, corsOrigins),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-Idempotency-Key", "X-Client-Id"],
      exposeHeaders: [
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "Retry-After",
      ],
      maxAge: 86_400,
    }),
  );

  app.use(
    "/api/*",
    rateLimit({
      windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
      max: rateLimitMax,
      key: clientKey,
      skip: (c) => c.req.method === "GET" || c.req.method === "OPTIONS",
    }),
  );

  app.use(
    "/api/boards/:id/sync",
    bodyLimit({
      maxSize: DEFAULT_SYNC_BODY_LIMIT,
      onError: (c) =>
        c.json(
          {
            error: "payload_too_large",
            message: "Sync payloads are limited to 1 MB.",
          },
          413,
        ),
    }),
  );

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
