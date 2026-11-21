/**
 * libSQL connection factory.
 *
 * A single adapter is used for both environments:
 * - local development: `file:./data/dev.db`
 * - production: `libsql://<database>.turso.io`
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";

export interface DatabaseOptions {
  readonly url: string;
  readonly authToken?: string | undefined;
}

function ensureFileDirectory(url: string): void {
  if (!url.startsWith("file:")) return;
  const rawPath = url.slice("file:".length);
  if (rawPath.startsWith(":") || rawPath.startsWith("//")) return;
  mkdirSync(dirname(rawPath), { recursive: true });
}

export function createDatabase(options: DatabaseOptions): Client {
  ensureFileDirectory(options.url);
  if (options.authToken !== undefined) {
    return createClient({ url: options.url, authToken: options.authToken });
  }
  return createClient({ url: options.url });
}
