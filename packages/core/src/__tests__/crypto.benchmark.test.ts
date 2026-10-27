import { describe, it, expect } from "vitest";
import {
  generateEncryptionKey,
  encryptData,
  decryptData,
} from "../index.js";
import { writeState, readState } from "../storage/state.js";
import { openSyncDB } from "../storage/db.js";

function generatePayload(targetSizeBytes: number): Record<string, string> {
  const chunk = "A".repeat(100);
  const count = Math.ceil(targetSizeBytes / 100);
  const data: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    data[`key_${i}`] = chunk;
  }
  return data;
}

async function measureAsync<T>(fn: () => Promise<T>): Promise<{ durationMs: number; result: T }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { durationMs, result };
}

describe("Web Crypto AES-GCM benchmark overhead", () => {
  const sizes = [
    { label: "1KB", bytes: 1024 },
    { label: "10KB", bytes: 10 * 1024 },
    { label: "100KB", bytes: 100 * 1024 },
    { label: "1MB", bytes: 1024 * 1024 },
  ];

  for (const { label, bytes } of sizes) {
    it(`measures encryption overhead for ${label} payload`, async () => {
      const key = await generateEncryptionKey(256);
      const payload = generatePayload(bytes);

      // 1. In-memory AES-GCM encrypt/decrypt
      const { durationMs: encTime, result: encrypted } = await measureAsync(() =>
        encryptData(payload, key),
      );
      const { durationMs: decTime, result: decrypted } = await measureAsync(() =>
        decryptData<typeof payload>(encrypted, key),
      );

      expect(decrypted).toEqual(payload);

      // 2. Storage write/read (Plaintext vs Encrypted)
      const dbPlain = await openSyncDB(`bench-plain-${label}`);
      const { durationMs: plainWriteTime } = await measureAsync(() =>
        writeState(dbPlain, payload),
      );
      const { durationMs: plainReadTime } = await measureAsync(() =>
        readState(dbPlain),
      );
      dbPlain.close();

      const dbEnc = await openSyncDB(`bench-enc-${label}`);
      const { durationMs: encWriteTime } = await measureAsync(() =>
        writeState(dbEnc, payload, key),
      );
      const { durationMs: encReadTime } = await measureAsync(() =>
        readState(dbEnc, key),
      );
      dbEnc.close();

      const summary = [
        `[Benchmark ${label.padEnd(5)}]`,
        `Enc: ${encTime.toFixed(2)}ms | Dec: ${decTime.toFixed(2)}ms`,
        `Write (Plain: ${plainWriteTime.toFixed(2)}ms, Enc: ${encWriteTime.toFixed(2)}ms)`,
        `Read (Plain: ${plainReadTime.toFixed(2)}ms, Enc: ${encReadTime.toFixed(2)}ms)`,
      ].join(" | ");
      console.info(summary);

      expect(encTime).toBeGreaterThanOrEqual(0);
      expect(decTime).toBeGreaterThanOrEqual(0);
    });
  }
});
