export interface EncryptedPayload {
  readonly __syncraft_encrypted: true;
  readonly iv: Uint8Array;
  readonly data: ArrayBuffer | Uint8Array;
}

export type EncryptionKeyInput = CryptoKey | string | Uint8Array;
