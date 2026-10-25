import type { SyncDB } from "./db.js";
import { STATE_STORE, STATE_KEY } from "./db.js";
import { encryptData, decryptData, isEncryptedPayload } from "../crypto/index.js";
import { SyncraftError } from "../errors.js";

export async function readState<T>(
  db: SyncDB,
  cryptoKey?: CryptoKey | null,
): Promise<T | undefined> {
  const value = await db.get(STATE_STORE, STATE_KEY);
  if (value === undefined) return undefined;
  if (cryptoKey) {
    return decryptData<T>(value, cryptoKey);
  }
  if (isEncryptedPayload(value)) {
    throw new SyncraftError(
      "Store data is encrypted, but no encryptionKey was provided.",
      { source: "store", retryable: false },
    );
  }
  return value as T | undefined;
}

export async function writeState<T>(
  db: SyncDB,
  value: T,
  cryptoKey?: CryptoKey | null,
): Promise<void> {
  const storedValue = cryptoKey ? await encryptData(value, cryptoKey) : value;
  await db.put(STATE_STORE, storedValue, STATE_KEY);
}
