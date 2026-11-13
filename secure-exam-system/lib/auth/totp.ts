/**
 * TOTP (Time-based One-Time Password) — RFC 6238
 * Uses the `otpauth` library for standard TOTP generation and verification.
 * TOTP secrets are generated per-user at registration and stored encrypted.
 */

import * as OTPAuth from "otpauth";
import { randomBytes } from "crypto";

const ISSUER = "SecureExamSystem";
const DIGITS = 6;
const PERIOD = 30; // seconds
const ALGORITHM = "SHA1"; // RFC 6238 standard
const WINDOW = 1; // Allow ±1 time step for clock drift

/**
 * Generate a new TOTP secret for a user.
 * Returns raw secret bytes (base32 for QR, hex for storage before encryption).
 */
export function generateTOTPSecret(): { secretBase32: string; secretHex: string } {
  const rawBytes = randomBytes(20); // 160-bit secret (RFC 4226 recommendation)
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromHex(rawBytes.toString("hex")),
  });
  return {
    secretBase32: totp.secret.base32,
    secretHex: rawBytes.toString("hex"),
  };
}

/**
 * Generate a QR-code URI for the user to scan with their authenticator app.
 * @param userEmail  Used as the account label in the QR code
 * @param secretBase32  base32-encoded TOTP secret
 */
export function generateTOTPUri(userEmail: string, secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: userEmail,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.toString(); // otpauth:// URI
}

// In-memory tracker for consumed TOTP time steps: userId -> lastConsumedStep
const consumedTimeSteps = new Map<string, number>();

/**
 * Verify a TOTP code provided by the user with anti-replay protection.
 * Accepts ±1 window (30s each side) to handle clock skew.
 * Prevents replay of the same token within the same time window.
 *
 * @param secretBase32  User's stored TOTP secret (base32)
 * @param token         6-digit code from authenticator app
 * @param userId        Optional user ID for replay protection tracking
 * @returns true if valid and not replayed; false otherwise
 */
export function verifyTOTP(secretBase32: string, token: string, userId?: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });

    const cleanToken = token.replace(/\s/g, "");
    // Returns the delta (time steps: -1, 0, or 1) if valid, null if invalid
    const delta = totp.validate({ token: cleanToken, window: WINDOW });
    if (delta === null) return false;

    if (userId) {
      const step = Math.floor(Date.now() / 1000 / PERIOD) + delta;
      const lastStep = consumedTimeSteps.get(userId);
      if (lastStep !== undefined && step <= lastStep) {
        // Replay of code from same or earlier time step
        return false;
      }
      consumedTimeSteps.set(userId, step);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a current TOTP token (server-side — used in tests only).
 */
export function generateCurrentToken(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

import { encryptAES256GCM, decryptAES256GCM } from "../crypto/aes";
import { createHash } from "crypto";

function getServerTOTPKey(): Buffer {
  const envKey = process.env.TOTP_ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, "hex");
  }
  const secret = process.env.JWT_SECRET ?? "default-totp-key-32-bytes-long!";
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a base32 TOTP secret under server key using AES-256-GCM.
 */
export function encryptTOTPSecret(secretBase32: string, usn: string = "default"): string {
  const key = getServerTOTPKey();
  const aad = {
    record_id: `totp-${usn}`,
    record_type: "totp_secret" as const,
    key_version: 1,
    algorithm: "AES-256-GCM" as const,
  };
  const encrypted = encryptAES256GCM(key, Buffer.from(secretBase32, "utf-8"), aad);
  return JSON.stringify({
    c: encrypted.ciphertext,
    t: encrypted.authTag,
    i: encrypted.iv,
  });
}

/**
 * Decrypt a stored TOTP secret JSON string back to base32 secret.
 */
export function decryptTOTPSecret(storageJson: string, usn: string = "default"): string {
  const key = getServerTOTPKey();
  const stored = JSON.parse(storageJson);
  const aad = {
    record_id: `totp-${usn}`,
    record_type: "totp_secret" as const,
    key_version: 1,
    algorithm: "AES-256-GCM" as const,
  };
  return decryptAES256GCM(
    key,
    {
      ciphertext: stored.c,
      authTag: stored.t,
      iv: stored.i,
      aad: JSON.stringify(aad),
      algorithm: "AES-256-GCM",
    },
    aad
  ).toString("utf-8");
}
