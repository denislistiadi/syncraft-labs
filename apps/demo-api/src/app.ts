import { Hono } from "hono";

export interface AppDependencies {
  /** Version string exposed by `/health`. */
  readonly version?: string;
}

/**
 * Creates the Hono application.
 *
 * Dependencies are injected so tests can use an isolated database and a fake
 * clock without booting the HTTP listener.
 */
export function createApp(deps: AppDependencies = {}): Hono {
  const app = new Hono();
  const version = deps.version ?? "0.9.0";

  app.get("/", (c) =>
    c.json({
      name: "syncraft-demo-api",
      version,
      health: "/health",
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

  return app;
}
