import { SyncraftError } from "../errors.js";
import type { EncryptionKeyInput } from "../types/crypto.js";

export async function resolveCryptoKey(
  input: EncryptionKeyInput,
  storageKey: string,
): Promise<CryptoKey> {
  if (typeof CryptoKey !== "undefined" && input instanceof CryptoKey) {
    if (input.algorithm.name !== "AES-GCM") {
      throw new SyncraftError(
        'Invalid CryptoKey: algorithm must be "AES-GCM".',
        { source: "store", retryable: false },
      );
    }
    if (!input.usages.includes("encrypt") || !input.usages.includes("decrypt")) {
      throw new SyncraftError(
        'Invalid CryptoKey: key usages must include both "encrypt" and "decrypt".',
        { source: "store", retryable: false },
      );
    }
    return input;
  }

  if (input instanceof Uint8Array) {
    if (![16, 24, 32].includes(input.byteLength)) {
      throw new SyncraftError(
        "Invalid key length: raw AES key must be 16, 24, or 32 bytes (128, 192, or 256 bits).",
        { source: "store", retryable: false },
      );
    }
    return await globalThis.crypto.subtle.importKey(
      "raw",
      input as unknown as BufferSource,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  }

  if (typeof input === "string") {
    if (input.length === 0) {
      throw new SyncraftError(
        "Encryption passphrase cannot be empty.",
        { source: "store", retryable: false },
      );
    }
    const enc = new TextEncoder();
    const baseKey = await globalThis.crypto.subtle.importKey(
      "raw",
      enc.encode(input),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );
    const salt = enc.encode(`syncraft-salt:${storageKey}`);
    return await globalThis.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  throw new SyncraftError(
    "Invalid encryption key input: expected CryptoKey, Uint8Array, or string passphrase.",
    { source: "store", retryable: false },
  );
}

export async function generateEncryptionKey(
  length: 128 | 192 | 256 = 256,
): Promise<CryptoKey> {
  return (await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKey;
}

export async function exportEncryptionKey(key: CryptoKey): Promise<string> {
  const raw = await globalThis.crypto.subtle.exportKey("raw", key);
  const bytes = new Uint8Array(raw);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

export async function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  const binary = atob(base64Key);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return resolveCryptoKey(bytes, "");
}
