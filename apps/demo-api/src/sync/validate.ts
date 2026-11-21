import { createHash } from "node:crypto";
import type { Patch } from "@syncraft-labs/core";
import type {
  ParsedSyncRequest,
  SyncEntry,
  SyncRequestError,
} from "./types.js";

const MAX_ENTRIES = 20;
const MAX_PATCHES_PER_ENTRY = 500;
const MAX_TOTAL_PATCHES = 1_000;
const MAX_PATH_DEPTH = 32;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPathSegment(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function parsePatch(value: unknown): Patch | null {
  if (!isRecord(value)) return null;
  if (value.op !== "add" && value.op !== "replace" && value.op !== "remove") return null;
  if (!Array.isArray(value.path) || value.path.length > MAX_PATH_DEPTH) return null;
  if (!value.path.every(isPathSegment)) return null;

  if (value.op === "remove") {
    return { op: "remove", path: value.path };
  }
  if (!("value" in value)) return null;
  return { op: value.op, path: value.path, value: value.value };
}

function parseEntries(value: unknown): SyncEntry[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ENTRIES) return null;

  const entries: SyncEntry[] = [];
  let totalPatches = 0;

  for (const candidate of value) {
    if (!isRecord(candidate)) return null;
    if (typeof candidate.id !== "string" || candidate.id.length === 0 || candidate.id.length > 128) return null;
    if (typeof candidate.timestamp !== "number" || !Number.isFinite(candidate.timestamp)) return null;
    if (!Array.isArray(candidate.patches) || candidate.patches.length > MAX_PATCHES_PER_ENTRY) return null;

    const patches: Patch[] = [];
    for (const rawPatch of candidate.patches) {
      const patch = parsePatch(rawPatch);
      if (!patch) return null;
      patches.push(patch);
    }

    totalPatches += patches.length;
    if (totalPatches > MAX_TOTAL_PATCHES) return null;

    entries.push({ id: candidate.id, timestamp: candidate.timestamp, patches });
  }

  return entries;
}

function deriveIdempotencyKey(entries: readonly SyncEntry[]): string {
  const material = entries.map((entry) => ({
    timestamp: entry.timestamp,
    patches: entry.patches,
  }));
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export function parseSyncRequest(
  body: unknown,
  headers: { clientId?: string | undefined; idempotencyKey?: string | undefined },
): ParsedSyncRequest | SyncRequestError {
  if (!isRecord(body)) {
    return { error: "invalid_body", message: "Expected a JSON object." };
  }

  const entries = parseEntries(body.entries);
  if (!entries) {
    return {
      error: "invalid_entries",
      message: `Provide 1-${MAX_ENTRIES} outbox entries with valid patches.`,
    };
  }

  const bodyClientId = typeof body.clientId === "string" ? body.clientId : undefined;
  const clientId = headers.clientId ?? bodyClientId ?? "anonymous";
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    return { error: "invalid_client_id", message: "Client IDs must match [A-Za-z0-9_-]{1,64}." };
  }

  const headerKey = headers.idempotencyKey;
  const idempotencyKey = headerKey ?? deriveIdempotencyKey(entries);
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return {
      error: "invalid_idempotency_key",
      message: "Idempotency keys must match [A-Za-z0-9:_-]{8,128}.",
    };
  }

  const baseVersion =
    typeof body.baseVersion === "number" && Number.isInteger(body.baseVersion) && body.baseVersion >= 0
      ? body.baseVersion
      : 0;

  return {
    payload: {
      clientId,
      idempotencyKey,
      baseVersion,
      entries,
    },
  };
}
