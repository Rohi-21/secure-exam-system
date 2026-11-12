/**
 * Ed25519 module — session binding challenge-response + audit log signing
 *
 * Server has a long-term Ed25519 key pair (from env).
 * Students generate Ed25519 keys in the browser (WebCrypto).
 * This module handles server-side operations only.
 */

import {
  generateKeyPairSync,
  createSign,
  createVerify,
  createPublicKey,
  createPrivateKey,
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

/** Sign data with Ed25519 private key */
export function ed25519Sign(privateKeyPem: string, data: Buffer): string {
  const signer = createSign("sha512"); // Ed25519 ignores hash — Node.js requires this
  signer.update(data);
  const privateKey = createPrivateKey(privateKeyPem);
  return signer.sign(privateKey, "base64");
}

/** Verify an Ed25519 signature */
export function ed25519Verify(
  publicKeyPem: string,
  data: Buffer,
  signatureB64: string
): boolean {
  try {
    const verifier = createVerify("sha512");
    verifier.update(data);
    const publicKey = createPublicKey(publicKeyPem);
    return verifier.verify(publicKey, Buffer.from(signatureB64, "base64"));
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
 * Server signs this with its long-term Ed25519 key.
 * Browser verifies before computing shared secret.
 */
export function buildHandshakePayload(params: {
  serverEphemeralPubKeyB64: string;
  examId: string;
  sessionId: string;
  nonce: string;
  timestamp: number;
  studentId: string;
}): Buffer {
  return Buffer.from(JSON.stringify(params), "utf-8");
}
