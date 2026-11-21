import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests for the React and Vue Kanban entries.
 *
 * Playwright starts the API and Vite from the repo root. An existing local dev
 * server is reused, which keeps `npm run test:e2e` fast while iterating.
 */
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => {
    return typeof entry[1] === "string";
  }),
);

/** Keep e2e writes out of the developer's local demo database. */
const e2eDatabaseUrl = pathToFileURL(
  join(tmpdir(), "syncraft-demo-e2e.db"),
).href;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "npm run dev --prefix ../.. --workspace @syncraft-labs/demo-api",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...inheritedEnv,
        RATE_LIMIT_MAX: "10000",
        TURSO_DATABASE_URL: e2eDatabaseUrl,
      },
    },
    {
      command:
        "npm run dev --prefix ../.. --workspace @syncraft-labs/demo-web",
      url: "http://localhost:5173/",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
