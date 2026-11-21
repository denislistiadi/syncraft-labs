/**
 * Runtime configuration for the demo API.
 *
 * All values come from environment variables so the same build runs against a
 * local SQLite file and a hosted Turso database.
 */

export interface DemoApiConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly authToken: string | undefined;
  readonly corsOrigins: readonly string[];
  readonly rateLimitMax: number;
  readonly version: string;
}

const DEFAULT_PORT = 8787;
const DEFAULT_DATABASE_URL = "file:./data/dev.db";
const DEFAULT_RATE_LIMIT_MAX = 120;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOrigins(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "" || value.trim() === "*") {
    return ["*"];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DemoApiConfig {
  const authToken = env.TURSO_AUTH_TOKEN?.trim();

  return {
    port: positiveInteger(env.PORT, DEFAULT_PORT),
    databaseUrl: env.TURSO_DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    authToken: authToken && authToken.length > 0 ? authToken : undefined,
    corsOrigins: parseOrigins(env.CORS_ORIGIN),
    rateLimitMax: positiveInteger(env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
    version: env.npm_package_version ?? "0.9.0",
  };
}
