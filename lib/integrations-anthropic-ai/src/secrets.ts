// AES-256-GCM encryption for stored provider API keys.
// Master key is read from SETTINGS_ENCRYPTION_KEY env var (32-byte hex string,
// 64 hex chars). Each ciphertext stores its own random 12-byte IV plus the
// 16-byte GCM auth tag.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

let _masterKey: Buffer | null = null;
function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey;
  const k = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!k) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY env var is required to encrypt/decrypt provider API keys. " +
      "Generate one with: openssl rand -hex 32",
    );
  }
  if (k.length !== 64 || !/^[0-9a-fA-F]+$/.test(k)) {
    throw new Error("SETTINGS_ENCRYPTION_KEY must be 64 hex characters (32 bytes).");
  }
  _masterKey = Buffer.from(k, "hex");
  return _masterKey;
}

export interface EncryptedSecret {
  cipher: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function encryptKey(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getMasterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { cipher: ct, iv, tag: cipher.getAuthTag() };
}

export function decryptKey(blob: EncryptedSecret): string {
  const decipher = createDecipheriv(ALGO, getMasterKey(), blob.iv);
  decipher.setAuthTag(blob.tag);
  return Buffer.concat([decipher.update(blob.cipher), decipher.final()]).toString("utf8");
}

// Convenience: returns true when the encryption key is configured (so the
// settings UI can skip re-encrypting unchanged values silently).
export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.SETTINGS_ENCRYPTION_KEY);
}
