/**
 * Ed25519 session binding — challenge-response
 * After password+TOTP pass, server issues a nonce.
 * Browser signs it with its Ed25519 private key.
 * Server verifies using the stored public key → confirms device possession.
 *
 * This is NOT a third authentication factor — it is a session integrity
 * mechanism that prevents JWT theft alone from being sufficient for hijacking.
 */

import { randomBytes } from "crypto";
import { ed25519Verify } from "../crypto/ed25519";

/** Active challenges: nonce → { userId, expiresAt } */
// In production use Redis; for the prototype, in-process Map is fine
const pendingChallenges = new Map<string, { userId: string; expiresAt: number }>();

const CHALLENGE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Issue a session binding challenge nonce for a user who passed 2FA.
 */
export function issueChallenge(userId: string): string {
  const nonce = randomBytes(32).toString("hex");
  pendingChallenges.set(nonce, { userId, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return nonce;
}

/**
 * Verify an Ed25519 challenge response.
 * @param nonce       The challenge nonce issued by issueChallenge()
 * @param signature   base64 Ed25519 signature of the nonce by the user's private key
 * @param ed25519PubKeyPem  The user's Ed25519 public key (stored at registration)
 * @returns { valid: boolean; userId: string | null }
 */
export function verifyChallenge(
  nonce: string,
  signature: string,
  ed25519PubKeyPem: string
): { valid: boolean; userId: string | null } {
  const record = pendingChallenges.get(nonce);

  if (!record) return { valid: false, userId: null };
  if (Date.now() > record.expiresAt) {
    pendingChallenges.delete(nonce);
    return { valid: false, userId: null };
  }

  // Verify Ed25519 signature: user signed the raw nonce bytes
  const isValid = ed25519Verify(
    ed25519PubKeyPem,
    Buffer.from(nonce, "hex"),
    signature
  );

  pendingChallenges.delete(nonce); // One-time use — consume regardless of result
  return { valid: isValid, userId: isValid ? record.userId : null };
}
