import { describe, it, expect } from "vitest";
import {
  createSyncStore,
  resolveCryptoKey,
  encryptData,
  decryptData,
  isEncryptedPayload,
  generateEncryptionKey,
  exportEncryptionKey,
  importEncryptionKey,
  SyncraftError,
} from "../index.js";
import { openSyncDB, STATE_STORE, STATE_ENTITIES_STORE, STATE_KEY } from "../storage/db.js";

describe("Web Crypto primitives", () => {
  it("resolves raw 16, 24, and 32-byte Uint8Array keys into AES-GCM CryptoKey", async () => {
    const key16 = new Uint8Array(16);
    const key24 = new Uint8Array(24);
    const key32 = new Uint8Array(32);
    crypto.getRandomValues(key16);
    crypto.getRandomValues(key24);
    crypto.getRandomValues(key32);

    const ck16 = await resolveCryptoKey(key16, "store-1");
    const ck24 = await resolveCryptoKey(key24, "store-2");
    const ck32 = await resolveCryptoKey(key32, "store-3");

    expect(ck16.algorithm.name).toBe("AES-GCM");
    expect(ck24.algorithm.name).toBe("AES-GCM");
    expect(ck32.algorithm.name).toBe("AES-GCM");
  });

  it("throws on invalid Uint8Array key lengths", async () => {
    const invalidKey = new Uint8Array(10);
    await expect(resolveCryptoKey(invalidKey, "store-1")).rejects.toThrow(
      /Invalid key length/,
    );
  });

  it("derives AES-GCM 256-bit key from passphrase using PBKDF2 with deterministic salt", async () => {
    const pass = "super-secret-passphrase";
    const keyA = await resolveCryptoKey(pass, "store-user");
    const keyB = await resolveCryptoKey(pass, "store-user");
    const keyDifferentStore = await resolveCryptoKey(pass, "store-other");

    const payload = await encryptData({ hello: "world" }, keyA);
    const decrypted = await decryptData(payload, keyB);
    expect(decrypted).toEqual({ hello: "world" });

    await expect(decryptData(payload, keyDifferentStore)).rejects.toThrow(
      /Failed to decrypt data/,
    );
  });

  it("throws on empty string passphrase", async () => {
    await expect(resolveCryptoKey("", "store-1")).rejects.toThrow(
      /passphrase cannot be empty/,
    );
  });

  it("validates CryptoKey inputs", async () => {
    const validKey = await generateEncryptionKey(256);
    const resolved = await resolveCryptoKey(validKey, "store-1");
    expect(resolved).toBe(validKey);

    const hmacKey = (await crypto.subtle.generateKey(
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    )) as CryptoKey;
    await expect(resolveCryptoKey(hmacKey, "store-1")).rejects.toThrow(
      /algorithm must be "AES-GCM"/,
    );
  });

  it("supports key generation, export, and import roundtrip", async () => {
    const originalKey = await generateEncryptionKey(256);
    const base64 = await exportEncryptionKey(originalKey);
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);

    const importedKey = await importEncryptionKey(base64);
    const payload = await encryptData({ test: 123 }, originalKey);
    const decrypted = await decryptData(payload, importedKey);
    expect(decrypted).toEqual({ test: 123 });
  });

  it("encrypts with fresh random 12-byte IV for every write", async () => {
    const key = await generateEncryptionKey(256);
    const data = { counter: 42 };

    const payload1 = await encryptData(data, key);
    const payload2 = await encryptData(data, key);

    expect(payload1.__syncraft_encrypted).toBe(true);
    expect(payload1.iv.byteLength).toBe(12);
    expect(payload2.iv.byteLength).toBe(12);
    expect(payload1.iv).not.toEqual(payload2.iv);
    expect(new Uint8Array(payload1.data)).not.toEqual(new Uint8Array(payload2.data));
  });

  it("detects tampered ciphertext and throws SyncraftError", async () => {
    const key = await generateEncryptionKey(256);
    const payload = await encryptData({ secret: "data" }, key);

    const tamperedData = new Uint8Array(payload.data.slice(0));
    tamperedData[0] = (tamperedData[0] ?? 0) ^ 0xff;

    const tamperedPayload = {
      ...payload,
      data: tamperedData.buffer,
    };

    await expect(decryptData(tamperedPayload, key)).rejects.toThrow(
      SyncraftError,
    );
    await expect(decryptData(tamperedPayload, key)).rejects.toThrow(
      /tampered ciphertext/,
    );
  });

  it("detects tampered IV and throws SyncraftError", async () => {
    const key = await generateEncryptionKey(256);
    const payload = await encryptData({ secret: "data" }, key);

    const tamperedIV = new Uint8Array(payload.iv);
    tamperedIV[0] = (tamperedIV[0] ?? 0) ^ 0xff;

    const tamperedPayload = {
      ...payload,
      iv: tamperedIV,
    };

    await expect(decryptData(tamperedPayload, key)).rejects.toThrow(
      /tampered ciphertext/,
    );
  });

  it("correctly identifies EncryptedPayload", async () => {
    const key = await generateEncryptionKey(256);
    const payload = await encryptData({ a: 1 }, key);

    expect(isEncryptedPayload(payload)).toBe(true);
    expect(isEncryptedPayload(null)).toBe(false);
    expect(isEncryptedPayload({})).toBe(false);
    expect(isEncryptedPayload({ __syncraft_encrypted: true })).toBe(false);
    expect(isEncryptedPayload({ a: 1, b: 2 })).toBe(false);
  });
});

describe("Encrypted Document Store integration", () => {
  const storageKey = "encrypted-doc-test";

  it("persists encrypted payload to IndexedDB and decrypts transparently on read", async () => {
    const key = await generateEncryptionKey(256);
    const store = createSyncStore<{ message: string; count: number }>({
      storageKey,
      encryptionKey: key,
      initialState: { message: "confidential", count: 1 },
    });

    await store.hydrate();
    expect(await store.get()).toEqual({ message: "confidential", count: 1 });

    // Inspect underlying IndexedDB content directly
    const db = await openSyncDB(storageKey);
    const rawStored = await db.get(STATE_STORE, STATE_KEY);
    db.close();

    expect(isEncryptedPayload(rawStored)).toBe(true);
    expect((rawStored as Record<string, unknown>).message).toBeUndefined();

    // Mutate state and ensure new encrypted record is persisted
    await store.set((draft) => {
      draft.count = 2;
    });
    expect(await store.get()).toEqual({ message: "confidential", count: 2 });

    const db2 = await openSyncDB(storageKey);
    const rawStored2 = await db2.get(STATE_STORE, STATE_KEY);
    db2.close();
    expect(isEncryptedPayload(rawStored2)).toBe(true);
    expect(rawStored2.iv).not.toEqual(rawStored.iv);

    store.destroy();
  });

  it("re-hydrates persisted state in a new store instance with the same key", async () => {
    const passphrase = "my-master-password";
    const store1 = createSyncStore<{ user: string }>({
      storageKey: "rehydrate-encrypted-doc",
      encryptionKey: passphrase,
      initialState: { user: "Alice" },
    });
    await store1.hydrate();
    await store1.set((draft) => {
      draft.user = "Bob";
    });
    store1.destroy();

    const store2 = createSyncStore<{ user: string }>({
      storageKey: "rehydrate-encrypted-doc",
      encryptionKey: passphrase,
    });
    await store2.hydrate();
    expect(await store2.get()).toEqual({ user: "Bob" });
    store2.destroy();
  });

  it("throws when re-hydrated with the wrong encryption key", async () => {
    const store1 = createSyncStore<{ data: string }>({
      storageKey: "wrong-key-test",
      encryptionKey: "passphrase-one",
      initialState: { data: "secret" },
    });
    await store1.hydrate();
    store1.destroy();

    const store2 = createSyncStore<{ data: string }>({
      storageKey: "wrong-key-test",
      encryptionKey: "passphrase-two",
    });
    await expect(store2.hydrate()).rejects.toThrow(SyncraftError);
    await expect(store2.hydrate()).rejects.toThrow(/invalid key or tampered/);
    store2.destroy();
  });

  it("throws when opening encrypted store without encryptionKey", async () => {
    const store1 = createSyncStore<{ data: string }>({
      storageKey: "missing-key-test",
      encryptionKey: "some-key",
      initialState: { data: "top-secret" },
    });
    await store1.hydrate();
    store1.destroy();

    const storePlain = createSyncStore<{ data: string }>({
      storageKey: "missing-key-test",
    });
    await expect(storePlain.hydrate()).rejects.toThrow(
      /no encryptionKey was provided/,
    );
    storePlain.destroy();
  });

  it("throws when opening unencrypted store with an encryptionKey", async () => {
    const storePlain = createSyncStore<{ data: string }>({
      storageKey: "unencrypted-to-encrypted-test",
      initialState: { data: "plaintext" },
    });
    await storePlain.hydrate();
    storePlain.destroy();

    const storeEncrypted = createSyncStore<{ data: string }>({
      storageKey: "unencrypted-to-encrypted-test",
      encryptionKey: "my-key",
    });
    await expect(storeEncrypted.hydrate()).rejects.toThrow(
      /Store data is not encrypted, but an encryptionKey was configured/,
    );
    storeEncrypted.destroy();
  });
});

describe("Encrypted Collection Store integration", () => {
  const storageKey = "encrypted-collection-test";

  it("encrypts individual entities with unique IVs in collection mode", async () => {
    const key = await generateEncryptionKey(256);
    const store = createSyncStore<Record<string, { id: string; name: string }>>({
      storageKey,
      storageMode: "collection",
      idField: "id",
      encryptionKey: key,
      initialState: {
        "1": { id: "1", name: "Doc 1" },
        "2": { id: "2", name: "Doc 2" },
      },
    });

    await store.hydrate();
    const state = await store.get();
    expect(state).toEqual({
      "1": { id: "1", name: "Doc 1" },
      "2": { id: "2", name: "Doc 2" },
    });

    // Check raw IndexedDB entries
    const db = await openSyncDB(storageKey);
    const raw1 = await db.get(STATE_ENTITIES_STORE, "1");
    const raw2 = await db.get(STATE_ENTITIES_STORE, "2");
    db.close();

    expect(isEncryptedPayload(raw1)).toBe(true);
    expect(isEncryptedPayload(raw2)).toBe(true);
    expect(raw1.iv).not.toEqual(raw2.iv);

    // Incremental mutation
    await store.set((draft) => {
      draft["3"] = { id: "3", name: "Doc 3" };
      delete draft["1"];
    });

    const updatedState = await store.get();
    expect(updatedState).toEqual({
      "2": { id: "2", name: "Doc 2" },
      "3": { id: "3", name: "Doc 3" },
    });

    const db2 = await openSyncDB(storageKey);
    const deleted1 = await db2.get(STATE_ENTITIES_STORE, "1");
    const raw3 = await db2.get(STATE_ENTITIES_STORE, "3");
    db2.close();

    expect(deleted1).toBeUndefined();
    expect(isEncryptedPayload(raw3)).toBe(true);

    store.destroy();
  });
});
