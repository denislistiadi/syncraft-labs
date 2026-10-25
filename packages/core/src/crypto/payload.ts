import { SyncraftError } from "../errors.js";
import type { EncryptedPayload } from "../types/crypto.js";

export function isEncryptedPayload(val: unknown): val is EncryptedPayload {
  if (typeof val !== "object" || val === null) return false;
  const candidate = val as Record<string, unknown>;
  if (candidate.__syncraft_encrypted !== true) return false;

  const isIV =
    candidate.iv instanceof Uint8Array ||
    ArrayBuffer.isView(candidate.iv) ||
    Object.prototype.toString.call(candidate.iv) === "[object Uint8Array]";

  const isData =
    candidate.data instanceof ArrayBuffer ||
    ArrayBuffer.isView(candidate.data) ||
    Object.prototype.toString.call(candidate.data) === "[object ArrayBuffer]";

  return isIV && isData;
}

export async function encryptData<T>(
  data: T,
  key: CryptoKey,
): Promise<EncryptedPayload> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const dataBuffer = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return {
    __syncraft_encrypted: true,
    iv,
    data: dataBuffer,
  };
}

export async function decryptData<T>(
  payload: unknown,
  key: CryptoKey,
): Promise<T> {
  if (payload === undefined || payload === null) {
    return payload as T;
  }
  if (!isEncryptedPayload(payload)) {
    throw new SyncraftError(
      "Store data is not encrypted, but an encryptionKey was configured.",
      { source: "store", retryable: false },
    );
  }

  try {
    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: payload.iv as unknown as BufferSource },
      key,
      payload.data as unknown as BufferSource,
    );
    const text = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof SyncraftError) {
      throw err;
    }
    throw new SyncraftError(
      "Failed to decrypt data: invalid key or tampered ciphertext.",
      { source: "store", retryable: false, cause: err },
    );
  }
}
