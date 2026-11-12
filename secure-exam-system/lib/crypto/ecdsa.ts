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

/**
 * Verify an ECDSA-P256 signature.
 * @param publicKeyPem  Student or examiner's ECDSA public key (PEM)
 * @param data          Original data that was signed
 * @param signatureB64  base64 signature
 * @returns true if signature is valid
 */
export function ecdsaVerify(
  publicKeyPem: string,
  data: Buffer,
  signatureB64: string
): boolean {
  try {
    const verifier = createVerify("SHA256");
    verifier.update(data);
    const publicKey = createPublicKey(publicKeyPem);
    return verifier.verify(publicKey, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
