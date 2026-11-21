import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Resolves relative `file:` URLs against `apps/demo-api` instead of the
 * process working directory, so `npm run dev` and `node dist/index.js` always
 * open the same SQLite file.
 */
export function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith("file:")) return url;

  const rawPath = url.slice("file:".length);
  if (
    rawPath.startsWith(":") ||
    rawPath.startsWith("//") ||
    rawPath.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(rawPath)
  ) {
    return url;
  }

  return `file:${resolve(packageRoot, rawPath)}`;
}
