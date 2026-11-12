/**
 * RSA-2048 key wrapping module (RSA-OAEP-SHA256)
 * Used for: wrapping ExamKEK with Examiner's public key
 *
 * Design: Examiners generate their RSA key pair in the browser (WebCrypto),
 * download the private key PEM, and upload only the public key to the server.
 * The private key NEVER touches the server.
 */

import {
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  constants,
  KeyObject,
  createPublicKey,
  createPrivateKey,
} from "crypto";

/** RSA-OAEP padding options with SHA-256 */
const OAEP_OPTIONS = {
  key: null as unknown as KeyObject,
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha256",
};

/**
 * Generate an RSA-2048 key pair.
 * In production: called in the examiner's browser via WebCrypto.
 * This server-side version is used in tests and the examiner key-ceremony CLI.
 */
export function generateRSAKeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * Wrap (encrypt) a DEK or KEK with an RSA-2048 public key using OAEP-SHA256.
 * @param publicKeyPem  Examiner's RSA public key (PEM / base64 DER)
 * @param keyMaterial   32-byte key to wrap
 * @returns base64-encoded wrapped key
 */
export function rsaWrapKey(publicKeyPem: string, keyMaterial: Buffer): string {
  const publicKey = createPublicKey(publicKeyPem);
  const wrapped = publicEncrypt(
    { ...OAEP_OPTIONS, key: publicKey },
    keyMaterial
  );
  return wrapped.toString("base64");
}

/**
 * Unwrap (decrypt) a wrapped key with an RSA-2048 private key.
 * @param privateKeyPem  Examiner's RSA private key (PEM)
 * @param wrappedKey     base64-encoded wrapped key
 * @returns Unwrapped 32-byte key material
 */
export function rsaUnwrapKey(
  privateKeyPem: string,
  wrappedKey: string
): Buffer {
  const privateKey = createPrivateKey(privateKeyPem);
  return privateDecrypt(
    { ...OAEP_OPTIONS, key: privateKey },
    Buffer.from(wrappedKey, "base64")
  );
}
