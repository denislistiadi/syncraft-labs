import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { resolveDatabaseUrl } from "./db/resolve-url.js";
import { migrateDatabase } from "./db/schema.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDatabase({
    url: resolveDatabaseUrl(config.databaseUrl),
    authToken: config.authToken,
  });

  await migrateDatabase(db);

  const app = createApp({
    db,
    version: config.version,
    corsOrigins: config.corsOrigins,
    rateLimitMax: config.rateLimitMax,
  });

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[demo-api] listening on http://localhost:${info.port}`);
    console.log(`[demo-api] database: ${config.databaseUrl}`);
  });
}

main().catch((error: unknown) => {
  console.error("[demo-api] failed to start", error);
  process.exitCode = 1;
});
