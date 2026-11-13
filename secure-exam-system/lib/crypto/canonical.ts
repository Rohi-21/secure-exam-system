/**
 * Cryptographic Canonicalization Helpers
 *
 * Provides RFC 8785 (JSON Canonicalization Scheme / JCS) style deterministic
 * key sorting so that content hashes and digital signatures match exactly
 * between Node.js backend and browser WebCrypto.
 */

import { sha256Hex } from "./hash";

/**
 * Deterministically sort an object's keys lexicographically at all nested levels.
 */
export function canonicalizeObject<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(canonicalizeObject) as unknown as T;
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    result[key] = canonicalizeObject((obj as Record<string, unknown>)[key]);
  }

  return result as T;
}

/**
 * Deterministically stringify an object with sorted keys and no unnecessary whitespace.
 */
export function canonicalJsonStringify(obj: unknown): string {
  const sorted = canonicalizeObject(obj);
  return JSON.stringify(sorted);
}

/**
 * Compute the SHA-256 digest of canonicalized JSON object.
 */
export function canonicalSha256Hex(obj: unknown): string {
  const canonicalJson = canonicalJsonStringify(obj);
  return sha256Hex(Buffer.from(canonicalJson, "utf-8"));
}

/**
 * Canonicalize student answer map: key numeric question numbers sorted numerically/lexicographically,
 * values trimmed uppercase strings.
 */
export function canonicalizeAnswers(answers: Record<string | number, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  const keys = Object.keys(answers).sort((a, b) => Number(a) - Number(b));

  for (const k of keys) {
    normalized[String(k)] = String(answers[k]).trim().toUpperCase();
  }

  return normalized;
}
