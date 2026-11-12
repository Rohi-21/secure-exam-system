/**
 * AES-256-GCM encryption/decryption module
 *
 * Design decisions:
 * - Every call generates a fresh 12-byte (96-bit) random IV — NEVER derived from key
 * - Authenticated Additional Data (AAD) is MANDATORY — prevents ciphertext-swap attacks
 * - Auth tag stored separately for explicit verification visibility
 * - Algorithm ID embedded in return value for future migration support
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface EncryptionAAD {
  record_id: string;
  record_type:
    | "question"
    | "answer_key"
    | "submission"
    | "result"
    | "key_share"
    | "totp_secret";
  exam_id?: string;
  user_id?: string;
  key_version: number;
  algorithm: "AES-256-GCM";
}

export interface EncryptedPayload {
  ciphertext: string; // base64
  authTag: string;    // base64 — 16 bytes (128-bit GCM tag)
  iv: string;         // base64 — 12 bytes (96-bit nonce)
  aad: string;        // JSON string of EncryptionAAD
  algorithm: "AES-256-GCM";
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * @param key      32-byte Buffer (256-bit key)
 * @param plaintext  String or Buffer to encrypt
 * @param aad        Authenticated Additional Data — authenticated but not encrypted
 */
export function encryptAES256GCM(
  key: Buffer,
  plaintext: string | Buffer,
  aad: EncryptionAAD
): EncryptedPayload {
  if (key.length !== 32) {
    throw new Error(`AES-256-GCM requires a 32-byte key, got ${key.length}`);
  }

  const iv = randomBytes(12); // Fresh random 96-bit nonce — never derived from key
  const aadBuffer = Buffer.from(JSON.stringify(aad), "utf-8");
  const plaintextBuffer =
    typeof plaintext === "string"
      ? Buffer.from(plaintext, "utf-8")
      : plaintext;

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadBuffer, { plaintextLength: plaintextBuffer.length });

  const encrypted = Buffer.concat([
    cipher.update(plaintextBuffer),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  return {
    ciphertext: encrypted.toString("base64"),
    authTag: authTag.toString("base64"),
    iv: iv.toString("base64"),
    aad: JSON.stringify(aad),
    algorithm: "AES-256-GCM",
  };
}

/**
 * Decrypt AES-256-GCM ciphertext.
 * Throws if auth tag verification fails (tamper detected).
 * @param key   32-byte Buffer
 * @param payload  EncryptedPayload returned by encryptAES256GCM
 * @param aad   Must exactly match the AAD used during encryption
 */
export function decryptAES256GCM(
  key: Buffer,
  payload: EncryptedPayload,
  aad: EncryptionAAD
): Buffer {
  if (key.length !== 32) {
    throw new Error(`AES-256-GCM requires a 32-byte key, got ${key.length}`);
  }

  const iv = Buffer.from(payload.iv, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const aadBuffer = Buffer.from(JSON.stringify(aad), "utf-8");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  decipher.setAAD(aadBuffer);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM authentication failed — ciphertext, tag, or AAD was modified
    throw new Error(
      "AES-256-GCM authentication failed: ciphertext integrity violation detected"
    );
  }
}

/**
 * Generate a cryptographically secure random 256-bit Data Encryption Key.
 */
export function generateDEK(): Buffer {
  return randomBytes(32);
}
