import { CLIENT_ID_STORAGE_KEY } from "./config.js";

let memoryClientId: string | null = null;

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId(): string {
  if (memoryClientId) return memoryClientId;

  try {
    // Per-tab on purpose: the SSE stream drops events whose `updatedBy`
    // matches this client, so two tabs must not share an identity.
    const stored = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (stored && stored.length > 0) {
      memoryClientId = stored;
      return stored;
    }
    const created = createId();
    window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
    memoryClientId = created;
    return created;
  } catch {
    memoryClientId = createId();
    return memoryClientId;
  }
}

function fallbackHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(4);
}

/**
 * Deterministic idempotency key material.
 *
 * `compactOutbox()` assigns a fresh entry ID on every call, so the entry ID
 * cannot be used to deduplicate retries. The timestamp plus patches are stable
 * across tabs and retries.
 */
export async function sha256Hex(input: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const bytes = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // Fall through to the non-cryptographic deterministic fallback.
  }
  return fallbackHash(input);
}
