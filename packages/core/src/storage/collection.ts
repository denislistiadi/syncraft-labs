import type { SyncDB } from "./db.js";
import { STATE_ENTITIES_STORE } from "./db.js";
import { encryptData, decryptData, isEncryptedPayload } from "../crypto/index.js";
import { SyncraftError } from "../errors.js";

export async function encryptEntities(
  entities: Record<string, unknown>,
  cryptoKey?: CryptoKey | null,
): Promise<[string, unknown][]> {
  if (!cryptoKey) return Object.entries(entities);
  return Promise.all(
    Object.entries(entities).map(async ([key, value]): Promise<[string, unknown]> => [
      key,
      await encryptData(value, cryptoKey),
    ]),
  );
}

export async function readCollectionState<T>(
  db: SyncDB,
  cryptoKey?: CryptoKey | null,
): Promise<T | undefined> {
  const keys = await db.getAllKeys(STATE_ENTITIES_STORE);
  if (keys.length === 0) return undefined;
  const values = await db.getAll(STATE_ENTITIES_STORE);
  const result: Record<string, unknown> = {};

  if (cryptoKey) {
    await Promise.all(
      keys.map(async (key, i) => {
        result[String(key)] = await decryptData(values[i], cryptoKey);
      }),
    );
  } else {
    for (let i = 0; i < keys.length; i++) {
      const val = values[i];
      if (isEncryptedPayload(val)) {
        throw new SyncraftError(
          "Store data is encrypted, but no encryptionKey was provided.",
          { source: "store", retryable: false },
        );
      }
      result[String(keys[i])] = val;
    }
  }

  return result as T;
}

export async function writeCollectionEntities(
  db: SyncDB,
  updatedEntities: Record<string, unknown>,
  deletedKeys: readonly string[] = [],
  cryptoKey?: CryptoKey | null,
): Promise<void> {
  const entriesToPut = await encryptEntities(updatedEntities, cryptoKey);
  const tx = db.transaction(STATE_ENTITIES_STORE, "readwrite");
  const store = tx.objectStore(STATE_ENTITIES_STORE);
  const promises: Promise<unknown>[] = [];
  for (const [key, value] of entriesToPut) promises.push(store.put(value, key));
  for (const key of deletedKeys) promises.push(store.delete(key));
  promises.push(tx.done);
  await Promise.all(promises);
}

export async function writeCollectionState<T>(
  db: SyncDB,
  value: T,
  cryptoKey?: CryptoKey | null,
): Promise<void> {
  const entriesToPut =
    value && typeof value === "object"
      ? await encryptEntities(value as Record<string, unknown>, cryptoKey)
      : [];

  const tx = db.transaction(STATE_ENTITIES_STORE, "readwrite");
  const store = tx.objectStore(STATE_ENTITIES_STORE);
  await store.clear();
  if (entriesToPut.length > 0) {
    const promises: Promise<unknown>[] = [];
    for (const [key, entity] of entriesToPut) promises.push(store.put(entity, key));
    promises.push(tx.done);
    await Promise.all(promises);
  } else {
    await tx.done;
  }
}
