/**
 * Key Derivation Functions module
 * - Argon2id  : user password hashing (RFC 9106)
 * - PBKDF2    : deterministic key derivation from passphrase (RFC 2898)
 * - HKDF      : expanding shared secrets into keying material (RFC 5869)
 */

import { hkdfSync, pbkdf2Sync, randomBytes } from "crypto";
import argon2 from "argon2";

// ─── Argon2id ───────────────────────────────────────────────────────────────

/** Argon2id parameters — RFC 9106 recommended minimum */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,        // 3 iterations
  parallelism: 4,     // 4 threads
  hashLength: 32,     // 256-bit output
};

/**
 * Hash a user password with Argon2id.
 * Returns a string containing salt + hash (argon2 encoded format).
 */
export async function argon2idHash(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against a stored Argon2id hash.
 * Returns true if the password matches.
 */
export async function argon2idVerify(
  storedHash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * Derive a 32-byte AES key from a passphrase using Argon2id.
 * Used for: encrypting Shamir shares with trustee passwords.
 * @param passphrase  Trustee's password
 * @param salt        32-byte random salt (stored alongside the share)
 */
export async function argon2idDeriveKey(
  passphrase: string,
  salt: Buffer
): Promise<Buffer> {
  const hash = await argon2.hash(passphrase, {
    ...ARGON2_OPTIONS,
    salt,
    raw: true, // return raw bytes instead of encoded string
  });
  return Buffer.from(hash as Buffer);
}

/** Generate a 32-byte random Argon2id salt */
export function generateArgon2Salt(): Buffer {
  return randomBytes(32);
}

// ─── PBKDF2 ─────────────────────────────────────────────────────────────────

/**
 * Derive a key using PBKDF2-HMAC-SHA256.
 * @param passphrase  Input passphrase / secret
 * @param salt        Random salt (at least 16 bytes)
 * @param iterations  Iteration count (minimum 100,000)
 * @param keyLength   Output key length in bytes
 */
export function pbkdf2DeriveKey(
  passphrase: string | Buffer,
  salt: Buffer,
  iterations: number = 100_000,
  keyLength: number = 32
): Buffer {
  return pbkdf2Sync(passphrase, salt, iterations, keyLength, "sha256");
}

// ─── HKDF ───────────────────────────────────────────────────────────────────

/**
 * HKDF-SHA256 key derivation.
 * Expands a high-entropy input key material (IKM) into keying material.
 * @param ikm    Input key material (e.g. ECDH shared secret)
 * @param salt   Optional random salt
 * @param info   Context/purpose string (e.g. "exam-kek", "session-enc")
 * @param length Output length in bytes
 */
export function hkdfDerive(
  ikm: Buffer,
  salt: Buffer | null,
  info: string,
  length: number = 32
): Buffer {
  const saltBuffer = salt ?? Buffer.alloc(32, 0); // RFC 5869 §2.2: zero-filled if no salt
  const result = hkdfSync("sha256", ikm, saltBuffer, Buffer.from(info, "utf-8"), length);
  return Buffer.from(result);
}

/**
 * Derive a session key bundle from an ECDH shared secret.
 * Returns three keys from one HKDF extraction.
 */
export function deriveSessionKeys(sharedSecret: Buffer, sessionId: string): {
  encKey: Buffer;    // AES-256-GCM key for session data encryption
  authKey: Buffer;   // HMAC-SHA256 key for request MAC
  ivSeed: Buffer;    // 16-byte seed for deterministic IV base
} {
  const salt = Buffer.from(sessionId, "utf-8");
  return {
    encKey:  hkdfDerive(sharedSecret, salt, "session-enc-key", 32),
    authKey: hkdfDerive(sharedSecret, salt, "session-auth-key", 32),
    ivSeed:  hkdfDerive(sharedSecret, salt, "session-iv-seed", 16),
  };
}
