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

/**
 * Verify a TOTP code provided by the user.
 * Accepts ±1 window (30s each side) to handle clock skew.
 * @param secretBase32  User's stored TOTP secret (base32)
 * @param token         6-digit code from authenticator app
 * @returns true if valid; false if wrong or expired
 */
export function verifyTOTP(secretBase32: string, token: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    // Returns the delta (time steps) if valid, null if invalid
    const delta = totp.validate({ token: token.replace(/\s/g, ""), window: WINDOW });
    return delta !== null;
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
