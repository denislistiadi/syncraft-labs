---
title: Encryption at Rest (AES-GCM)
description: Client-side authenticated encryption (AES-GCM 256-bit) for IndexedDB state in Syncraft Labs with zero-knowledge key architecture.
head:
  - tag: meta
    attrs:
      name: keywords
      content: indexeddb encryption, web crypto aes-gcm, client side encryption, local-first security, zero knowledge offline storage, syncraft encryption at rest
---

In offline-first and local-first web applications, user data is persisted directly inside the browser's IndexedDB database. For applications operating in **healthcare (HIPAA), finance, legal, or privacy-critical domains**, storing sensitive records in plaintext on client disks presents a compliance and security risk.

Syncraft Labs introduces **optional, zero-overhead Encryption at Rest** using the native browser **Web Crypto API (AES-GCM 256-bit)**.

---

## Architectural Flow

When encryption is enabled, state snapshots (in `document` mode) and individual entities (in `collection` mode) are encrypted and authenticated prior to entering IndexedDB transactions:

```mermaid
graph TD
  subgraph Application Memory
    A["store.set(draft => { ... })"] --> B["In-Memory State (Plaintext)"]
  end

  subgraph Web Crypto Engine
    B --> C["Generate fresh random 12-byte IV"]
    C --> D["AES-GCM 256-bit Encryption + Auth Tag"]
    D --> E["EncryptedPayload { iv, data, __syncraft_encrypted }"]
  end

  subgraph Persistent Storage
    E --> F["IndexedDB Object Store ('state' or 'state_entities')"]
  end

  subgraph Hydration & Read Cycle
    F --> G["Read EncryptedPayload from IndexedDB"]
    G --> H["AES-GCM Decrypt & Tag Verification"]
    H -- "Tag Valid & Key Matches" --> I["In-Memory State Snapshot"]
    H -- "Tampered or Wrong Key" --> J["Throw typed SyncraftError"]
  end
```

---

## Key Management & Zero-Knowledge Architecture

Syncraft Labs adheres strictly to a **zero-knowledge security architecture**:

> [!IMPORTANT]
> **The Library NEVER Stores Your Encryption Keys**
>
> 1. Syncraft Labs does not persist or cache your `CryptoKey`, raw keys, or passphrases to IndexedDB, LocalStorage, sessionStorage, cookies, or any persistent medium.
> 2. **Application Responsibility**: Your host application must manage key lifecycle (e.g. deriving a key from the user's master password upon login, holding it in an ephemeral module variable or React/Vue context, and wiping it on logout).
> 3. **Irrecoverable Data Loss**: Because AES-GCM is cryptographically strong and authenticated, **if the user loses their password or encryption key, persisted IndexedDB data cannot be decrypted or recovered by anyone—including the library authors or server operators.**

---

## Threat Model: What Is & Isn't Protected

| Threat Scenario | Protected? | Explanation |
| :--- | :---: | :--- |
| **Physical device theft or disk imaging** | ✅ Yes | Persisted IndexedDB files (LevelDB / SQLite) store only authenticated ciphertext (`EncryptedPayload`). Without the key, data cannot be extracted. |
| **Forensic browser storage extraction** | ✅ Yes | Raw files extracted from browser profiles contain no plaintext state. |
| **Ciphertext tampering & bit-flipping** | ✅ Yes | AES-GCM validates a 128-bit authentication tag on every read. Corrupted records immediately reject with `SyncraftError`. |
| **Ciphertext downgrade attack** | ✅ Yes | Stores configured with an `encryptionKey` reject unencrypted plaintext records. |
| **Cross-Site Scripting (XSS)** | ❌ No | An attacker with arbitrary JavaScript execution inside the origin can read state from active runtime memory. Mitigate with strict CSP and sanitization. |

---

## Supported Key Inputs

The `encryptionKey` option accepts three flexible formats:

```ts
export type EncryptionKeyInput = CryptoKey | string | Uint8Array;
```

### 1. Web Crypto `CryptoKey` (Recommended)
Pre-generated or imported native `CryptoKey` configured for `AES-GCM` with `"encrypt"` and `"decrypt"` usages:

```ts
import { generateEncryptionKey } from "@syncraft-labs/core";

// Generates an extractable AES-GCM 256-bit CryptoKey
const cryptoKey = await generateEncryptionKey(256);
```

### 2. User Passphrase (`string`)
Syncraft automatically derives a 256-bit AES-GCM key using **PBKDF2** (100,000 iterations, SHA-256) salted deterministically with `syncraft-salt:${storageKey}`:

```ts
const store = createSyncStore<AppState>({
  storageKey: "my-secure-store",
  encryptionKey: "user-provided-master-passphrase",
});
```

### 3. Raw Bytes (`Uint8Array`)
Raw 16-byte (128-bit), 24-byte (192-bit), or 32-byte (256-bit) cryptographic key imported directly via `crypto.subtle.importKey`:

```ts
const rawKey = new Uint8Array(32);
crypto.getRandomValues(rawKey);

const store = createSyncStore<AppState>({
  storageKey: "my-secure-store",
  encryptionKey: rawKey,
});
```

---

## Usage Examples

### Core (`@syncraft-labs/core`)

```ts
import { createSyncStore, generateEncryptionKey } from "@syncraft-labs/core";

const key = await generateEncryptionKey(256);

const store = createSyncStore<UserProfile>({
  storageKey: "user-profile",
  encryptionKey: key,
  initialState: { ssn: "000-00-0000", medicalHistory: [] },
});

await store.hydrate();
await store.set((draft) => {
  draft.medicalHistory.push("Annual checkup completed");
});
```

### React (`@syncraft-labs/react`)

```tsx
import { useSync } from "@syncraft-labs/react";

function SecureVault({ userSessionKey }: { userSessionKey: CryptoKey }) {
  const { data, update, isHydrating, error } = useSync<VaultState>("user-vault", {
    initialState: { secrets: [] },
    encryptionKey: userSessionKey,
  });

  if (isHydrating) return <p>Decrypting vault from IndexedDB...</p>;
  if (error) return <p>Decryption failed: {error.message}</p>;

  return (
    <div>
      <button onClick={() => update((d) => { d.secrets.push("New secret"); })}>
        Add Secret
      </button>
    </div>
  );
}
```

### Vue 3 (`@syncraft-labs/vue`)

```vue
<script setup lang="ts">
import { useSync } from "@syncraft-labs/vue";

const props = defineProps<{ sessionKey: CryptoKey | string }>();

const { data, update, isHydrating, error } = useSync<VaultState>("user-vault", {
  initialState: { secrets: [] },
  encryptionKey: props.sessionKey,
});
</script>

<template>
  <p v-if="isHydrating">Decrypting vault from IndexedDB...</p>
  <p v-else-if="error">Decryption failed: {{ error.message }}</p>
  <div v-else>
    <!-- Vault UI -->
  </div>
</template>
```

---

## Performance Benchmark & Overhead Analysis

Because encryption uses native browser hardware-accelerated instructions (AES-NI), the overhead of AES-GCM is negligible for standard local-first state payloads:

| Payload Size | Encrypt Time (ms) | Decrypt Time (ms) | Plain Write vs Enc Write | User Perceived Impact |
| :--- | :---: | :---: | :---: | :--- |
| **1 KB** | **~0.8 ms** | **~0.6 ms** | ~1.5ms vs ~1.8ms | Completely imperceptible (< 2ms) |
| **10 KB** | **~1.1 ms** | **~1.0 ms** | ~2.0ms vs ~2.4ms | Completely imperceptible (< 3ms) |
| **100 KB** | **~3.2 ms** | **~2.8 ms** | ~8.0ms vs ~9.5ms | Well within 16ms 60fps frame budget |
| **1 MB** | **~18 ms** | **~14 ms** | ~28ms vs ~35ms | Recommended to use `collection` mode |

> [!TIP]
> **Use Collection Mode for Large Datasets**: If your state exceeds 100KB, use `storageMode: "collection"`. Syncraft encrypts only the specific entities being mutated rather than re-encrypting the entire dataset, maintaining 60fps responsiveness.
