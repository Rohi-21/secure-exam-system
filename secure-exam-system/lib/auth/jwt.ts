/**
 * JWT access + refresh token management
 * Uses the `jose` library (Web Crypto compatible, no secret management footguns).
 *
 * Token strategy:
 *  - Access token:  15-minute lifetime, contains { userId, role, sessionId }
 *  - Refresh token: 7-day lifetime, stored server-side (refresh token rotation)
 *  - Refresh token rotation: each refresh invalidates old token, issues new one
 *  - Ed25519 session binding: access token also contains ecdsaPubKeyHash to
 *    bind session to the browser's private key
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { randomBytes } from "crypto";
import { sha256Hex } from "../crypto/hash";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload extends JWTPayload {
  userId: string;
  usn: string;
  role: "student" | "examiner" | "admin" | "hod";
  sessionId: string;
  ecdsaPubKeyHash: string; // SHA-256 of the student's ECDSA public key — session binding
}

export interface RefreshTokenRecord {
  tokenId: string;      // stored in DB, used to identify refresh token family
  userId: string;
  expiresAt: Date;
  revoked: boolean;
}

/**
 * Issue a signed JWT access token.
 */
export async function signAccessToken(payload: Omit<AccessTokenPayload, "iat" | "exp" | "jti">): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setJti(randomBytes(16).toString("hex"))
    .sign(getSecret());
}

/**
 * Verify and decode an access token.
 * Throws if expired or invalid signature.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as AccessTokenPayload;
}

/**
 * Generate a new opaque refresh token (random bytes, not JWT).
 * Store tokenId in DB; return the full token to client via httpOnly cookie.
 */
export function generateRefreshToken(): { token: string; tokenId: string; expiresAt: Date } {
  const rawBytes = randomBytes(32);
  const token = rawBytes.toString("base64url");
  const tokenId = sha256Hex(rawBytes); // store hash in DB, not raw token
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
  return { token, tokenId, expiresAt };
}

/**
 * Hash a refresh token for DB storage comparison.
 * Always compare stored hash, never store raw token.
 */
export function hashRefreshToken(rawToken: string): string {
  return sha256Hex(Buffer.from(rawToken, "base64url"));
}
