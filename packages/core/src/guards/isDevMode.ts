export function isDevMode(): boolean {
  const nodeEnv = (globalThis as Record<string, unknown>).process as
    | { env?: { NODE_ENV?: string } }
    | undefined;
  return nodeEnv?.env?.NODE_ENV !== "production";
}
