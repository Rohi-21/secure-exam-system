/**
 * Hashing module — SHA-256, SHA-3-256, BLAKE3, HMAC-SHA256
 * Used for: audit hash chain, commitment scheme, content hashes
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";

/** SHA-256 — NIST FIPS 180-4 */
export function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function sha256Hex(data: string | Buffer): string {
  return sha256(data).toString("hex");
}

/** SHA-3-256 (Keccak) — NIST FIPS 202 */
export function sha3_256(data: string | Buffer): Buffer {
  return createHash("sha3-256").update(data).digest();
}

export function sha3_256Hex(data: string | Buffer): string {
  return sha3_256(data).toString("hex");
}

/** BLAKE3 — via Node.js shake_256 as approximation; true BLAKE3 needs native addon */
// Note: Node.js does not natively support BLAKE3.
// For the benchmark experiment, we use the `blake3` npm package.
// This placeholder documents the intent.
export function blake3Placeholder(data: string | Buffer): Buffer {
  // Replace with: import { hash } from 'blake3'; return Buffer.from(hash(data));
  // For now fall back to SHA-256 and document in benchmark
  console.warn("[crypto/hash] BLAKE3 not installed — using SHA-256 fallback");
  return sha256(data);
}

/** HMAC-SHA256 — RFC 2104 */
export function hmacSha256(key: Buffer, data: string | Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/**
 * Constant-time HMAC comparison — prevents timing attacks.
 * Use this for all MAC verification, never use ===.
 */
export function hmacVerify(
  key: Buffer,
  data: string | Buffer,
  expected: Buffer
): boolean {
  const computed = hmacSha256(key, data);
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

/**
 * SHA-256 hash chain entry computation.
 * hash_N = SHA-256(entry_data_json + prev_hash_hex)
 */
export function hashChainEntry(
  entryData: object,
  prevHashHex: string
): string {
  const input = JSON.stringify(entryData) + prevHashHex;
  return sha256Hex(Buffer.from(input, "utf-8"));
}

/** Genesis hash for the first audit log entry */
export const GENESIS_HASH = "0".repeat(64);
