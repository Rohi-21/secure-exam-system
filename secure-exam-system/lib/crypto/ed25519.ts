/**
 * Ed25519 module — session binding challenge-response + audit log signing
 *
 * Server has a long-term Ed25519 key pair (from env).
 * Students generate Ed25519 keys in the browser (WebCrypto).
 * This module handles server-side operations only.
 */

import {
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "crypto";
import { randomBytes } from "crypto";

/** Generate an Ed25519 key pair (for server identity and tests) */
export function generateEd25519KeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/** Sign data with Ed25519 private key (one-shot, prehash-free) */
export function ed25519Sign(privateKeyPem: string, data: Buffer): string {
  const privateKey = createPrivateKey(privateKeyPem);
  return cryptoSign(null, data, privateKey).toString("base64");
}

/** Helper to parse a public key whether it is PEM or raw Base64 SPKI */
export function importEd25519PublicKey(keyInput: string) {
  const trimmed = keyInput.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    return createPublicKey(trimmed);
  }
  // Try importing as DER SPKI from Base64
  const der = Buffer.from(trimmed, "base64");
  return createPublicKey({
    key: der,
    format: "der",
    type: "spki",
  });
}

/** Verify an Ed25519 signature */
export function ed25519Verify(
  publicKeyInput: string,
  data: Buffer,
  signatureB64: string
): boolean {
  try {
    const publicKey = importEd25519PublicKey(publicKeyInput);
    return cryptoVerify(null, data, publicKey, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/**
 * Generate a session binding challenge.
 * The browser will sign this with the student's Ed25519 private key.
 */
export function generateSessionChallenge(): {
  nonce: string;   // 32 random bytes, hex
  issuedAt: number; // Unix timestamp ms
} {
  return {
    nonce: randomBytes(32).toString("hex"),
    issuedAt: Date.now(),
  };
}

/**
 * Build the signed payload for the ECDH handshake.
 * Binds both client and server ephemeral public keys, identities, session, and nonce.
 * Uses deterministic key ordering.
 */
export function buildHandshakePayload(params: {
  serverEphemeralPubKeyB64: string;
  clientEphemeralPubKeyB64: string;
  examId: string;
  sessionId: string;
  nonce: string;
  timestamp: number;
  studentId: string;
}): Buffer {
  const sorted = {
    clientEphemeralPubKeyB64: params.clientEphemeralPubKeyB64,
    examId: params.examId,
    nonce: params.nonce,
    sessionId: params.sessionId,
    serverEphemeralPubKeyB64: params.serverEphemeralPubKeyB64,
    studentId: params.studentId,
    timestamp: params.timestamp,
  };
  return Buffer.from(JSON.stringify(sorted), "utf-8");
}
