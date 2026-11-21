import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ version: config.version });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[demo-api] listening on http://localhost:${info.port}`);
  console.log(`[demo-api] database: ${config.databaseUrl}`);
});
