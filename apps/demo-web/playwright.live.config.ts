import { defineConfig, devices, type Project } from "@playwright/test";

/**
 * Runs the browser suite against a deployed environment.
 *
 * Usage (bash):
 *   E2E_WEB_URL=https://... E2E_API_URL=https://... npm run test:e2e:live
 *
 * Optional:
 *   E2E_BROWSERS=chromium,webkit,firefox
 *
 * The suite uses a unique board per test and one worker, which keeps the
 * free-tier API below its write rate limit. The first request can be slow
 * while Render wakes the API; individual tests get a longer timeout.
 */
const webUrl = process.env.E2E_WEB_URL?.trim().replace(/\/+$/, "");
const apiUrl = process.env.E2E_API_URL?.trim().replace(/\/+$/, "");

if (!webUrl || !apiUrl) {
  throw new Error(
    "E2E_WEB_URL and E2E_API_URL are required for live Playwright runs.",
  );
}

const requestedBrowsers = new Set(
  (process.env.E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0),
);

const projects: Project[] = [];
if (requestedBrowsers.has("chromium")) {
  projects.push({ name: "chromium", use: { ...devices["Desktop Chrome"] } });
}
if (requestedBrowsers.has("firefox")) {
  projects.push({ name: "firefox", use: { ...devices["Desktop Firefox"] } });
}
if (requestedBrowsers.has("webkit")) {
  projects.push({ name: "webkit", use: { ...devices["Desktop Safari"] } });
}

if (projects.length === 0) {
  throw new Error("E2E_BROWSERS must include chromium, firefox, or webkit.");
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results-live",
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-live" }],
  ],
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects,
});
