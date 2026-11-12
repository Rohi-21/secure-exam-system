/**
 * ECDH-P256 + HKDF session key exchange module
 *
 * Purpose: Application-layer key exchange above TLS.
 * Protects question paper delivery from passive TLS interception
 * and TLS-terminating infrastructure components.
 *
 * Trust model: Server's ephemeral public key is signed with the server's
 * long-term Ed25519 key. The browser verifies this signature.
 * Limitation: The server Ed25519 public key is delivered via TLS on page load —
 * it does not provide protection against an active MITM who controls TLS.
 * This is documented and acknowledged.
 *
 * Uses ECDH-P256 (not X25519) for maximum browser WebCrypto compatibility.
 */

import {
  generateKeyPairSync,
  createECDH,
  ECDH,
} from "crypto";
import { hkdfDerive, deriveSessionKeys } from "./kdf";

/**
 * Generate an ephemeral ECDH-P256 key pair.
 * Both client and server call this per session.
 * The private key MUST be discarded (zeroed) after the shared secret is computed.
 */
export function generateECDHKeyPair(): {
  ecdh: ECDH;
  publicKeyB64: string;
} {
  const ecdh = createECDH("prime256v1"); // P-256
  ecdh.generateKeys();
  return {
    ecdh,
    publicKeyB64: ecdh.getPublicKey("base64"),
  };
}

/**
 * Compute the ECDH shared secret from the local private key and the peer's public key.
 * @param localECDH       Our ephemeral ECDH instance (holds private key)
 * @param peerPublicKeyB64  Peer's ephemeral public key (base64)
 * @returns Raw 32-byte shared secret
 */
export function computeSharedSecret(
  localECDH: ECDH,
  peerPublicKeyB64: string
): Buffer {
  const peerPublicKey = Buffer.from(peerPublicKeyB64, "base64");
  const secret = localECDH.computeSecret(peerPublicKey);
  return secret;
}

/**
 * Full server-side ECDH handshake:
 * 1. Generate server ephemeral key pair
 * 2. Compute shared secret from client's public key
 * 3. Derive session keys via HKDF
 * 4. Return session keys + server public key (to send to client)
 * 5. ECDH instance (and private key) is discarded after this call.
 */
export function serverHandshake(
  clientPublicKeyB64: string,
  sessionId: string
): {
  sessionKeys: ReturnType<typeof deriveSessionKeys>;
  serverEphemeralPubKeyB64: string;
} {
  const { ecdh, publicKeyB64 } = generateECDHKeyPair();
  const sharedSecret = computeSharedSecret(ecdh, clientPublicKeyB64);

  // Derive session keys via HKDF
  const sessionKeys = deriveSessionKeys(sharedSecret, sessionId);

  // ecdh (and its private key) goes out of scope here — GC collects it
  // In production, explicitly zero sensitive memory if the runtime supports it

  return {
    sessionKeys,
    serverEphemeralPubKeyB64: publicKeyB64,
  };
}
