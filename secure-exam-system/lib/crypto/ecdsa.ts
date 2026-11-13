/**
 * ECDSA-P256 digital signatures module (server-side)
 * Used for: verifying student submission signatures, examiner result signatures
 *
 * Student ECDSA keys are generated in the browser via WebCrypto.
 * This module only verifies on the server side.
 */

import {
  generateKeyPairSync,
  createSign,
  createVerify,
  KeyObject,
  createPublicKey,
  createPrivateKey,
} from "crypto";

/** Generate ECDSA P-256 key pair (for tests and seeding only) */
export function generateECDSAKeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * Sign data with ECDSA-P256 (server-side use only — primarily for examiner result signing).
 * Student signing happens in the browser via WebCrypto.
 */
export function ecdsaSign(privateKeyPem: string, data: Buffer): string {
  const signer = createSign("SHA256");
  signer.update(data);
  const privateKey = createPrivateKey(privateKeyPem);
  return signer.sign(privateKey, "base64");
}

/** Helper to import ECDSA public key whether PEM or raw Base64 SPKI */
export function importECDSAPublicKey(keyInput: string) {
  const trimmed = keyInput.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    return createPublicKey(trimmed);
  }
  const der = Buffer.from(trimmed, "base64");
  return createPublicKey({
    key: der,
    format: "der",
    type: "spki",
  });
}

/**
 * Verify an ECDSA-P256 signature.
 * Supports both standard ASN.1 DER encoding and WebCrypto IEEE P1363 (r || s, 64-byte) encoding.
 *
 * @param publicKeyInput Student or examiner's ECDSA public key (PEM or SPKI Base64)
 * @param data           Original data that was signed
 * @param signatureB64   base64 signature
 * @returns true if signature is valid
 */
export function ecdsaVerify(
  publicKeyInput: string,
  data: Buffer,
  signatureB64: string
): boolean {
  try {
    const publicKey = importECDSAPublicKey(publicKeyInput);
    const sigBuf = Buffer.from(signatureB64, "base64");

    // 1. Try IEEE P1363 (standard WebCrypto output format: exactly 64 bytes for P-256)
    if (sigBuf.length === 64) {
      try {
        const verifier = createVerify("SHA256");
        verifier.update(data);
        const valid = verifier.verify(
          { key: publicKey, dsaEncoding: "ieee-p1363" },
          sigBuf
        );
        if (valid) return true;
      } catch {
        // Fall through to try DER
      }
    }

    // 2. Try ASN.1 DER (standard Node.js crypto output)
    const verifier = createVerify("SHA256");
    verifier.update(data);
    return verifier.verify(publicKey, sigBuf);
  } catch {
    return false;
  }
}
