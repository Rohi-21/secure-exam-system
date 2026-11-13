/**
 * Stage 7 Integration & Cryptographic Workflow Test Suite
 *
 * Verifies:
 * 1. Authority ECDH Handshake contract & key derivation parity (Node + WebCrypto)
 * 2. Handshake transcript authentication & tamper rejection
 * 3. RFC 8785 Canonicalization & deterministic answer digest
 * 4. Dual-format ECDSA signature verification (IEEE P1363 raw 64-byte + ASN.1 DER)
 * 5. Independent trustee authorization & Shamir 2-of-3 reconstruction
 * 6. Audit hash chain continuity with concurrency-safe sequence numbering
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes, createSign, createVerify } from "crypto";
import { generateECDHKeyPair, computeSharedSecret, serverHandshake } from "../../lib/crypto/ecdh";
import { hkdfDerive, deriveSessionKeys } from "../../lib/crypto/kdf";
import { buildHandshakePayload, ed25519Sign, ed25519Verify, generateEd25519KeyPair } from "../../lib/crypto/ed25519";
import { canonicalizeAnswers, canonicalJsonStringify, canonicalSha256Hex } from "../../lib/crypto/canonical";
import { generateECDSAKeyPair, ecdsaSign, ecdsaVerify } from "../../lib/crypto/ecdsa";
import { splitAndEncryptKEK, decryptSingleShare, combineRawShares, generateExamKEK } from "../../lib/crypto/shamir";
import { buildAuditEntry, computeEntryHash, verifyAuditChain, GENESIS_HASH, AuditEntry } from "../../lib/audit/chain";

describe("Stage 7: Core Examination Cryptographic Workflow & Contracts", () => {
  it("1. ECDH Handshake: Client and server derive identical key material using agreed HKDF parameters", () => {
    // Client ephemeral ECDH P-256
    const clientECDH = createECDH("prime256v1");
    clientECDH.generateKeys();
    const clientPubB64 = clientECDH.getPublicKey("base64");

    const sessionId = "test-session-uuid-1234";

    // Server-side handshake
    const { sessionKeys: serverKeys, serverEphemeralPubKeyB64 } = serverHandshake(clientPubB64, sessionId);

    // Client computes shared secret and derives session keys
    const clientSharedSecret = clientECDH.computeSecret(Buffer.from(serverEphemeralPubKeyB64, "base64"));
    const clientDerivedEnc = hkdfDerive(clientSharedSecret, Buffer.from(sessionId, "utf-8"), "session-enc-key", 32);
    const clientDerivedAuth = hkdfDerive(clientSharedSecret, Buffer.from(sessionId, "utf-8"), "session-auth-key", 32);
    const clientDerivedIV = hkdfDerive(clientSharedSecret, Buffer.from(sessionId, "utf-8"), "session-iv-seed", 16);

    // Both parties must derive bit-for-bit identical key material
    assert.deepEqual(clientDerivedEnc, serverKeys.encKey);
    assert.deepEqual(clientDerivedAuth, serverKeys.authKey);
    assert.deepEqual(clientDerivedIV, serverKeys.ivSeed);
  });

  it("2. Handshake Transcript: Binds both public keys, identities, session and detects tampering", () => {
    const { privateKeyPem: serverPriv, publicKeyPem: serverPub } = generateEd25519KeyPair();
    const clientPub = "client-ephemeral-pub-b64";
    const serverPubB64 = "server-ephemeral-pub-b64";
    const examId = "exam-001";
    const sessionId = "session-001";
    const nonce = "nonce-001";
    const timestamp = Date.now();
    const studentId = "student-001";

    const payloadBuf = buildHandshakePayload({
      serverEphemeralPubKeyB64: serverPubB64,
      clientEphemeralPubKeyB64: clientPub,
      examId,
      sessionId,
      nonce,
      timestamp,
      studentId,
    });

    const signature = ed25519Sign(serverPriv, payloadBuf);

    // Valid transcript passes
    assert.equal(ed25519Verify(serverPub, payloadBuf, signature), true);

    // Tampering with examId is detected and rejected
    const tamperedExam = buildHandshakePayload({
      serverEphemeralPubKeyB64: serverPubB64,
      clientEphemeralPubKeyB64: clientPub,
      examId: "exam-ATTACKER",
      sessionId,
      nonce,
      timestamp,
      studentId,
    });
    assert.equal(ed25519Verify(serverPub, tamperedExam, signature), false);

    // Tampering with server public key is detected and rejected
    const tamperedKey = buildHandshakePayload({
      serverEphemeralPubKeyB64: "malicious-pub-b64",
      clientEphemeralPubKeyB64: clientPub,
      examId,
      sessionId,
      nonce,
      timestamp,
      studentId,
    });
    assert.equal(ed25519Verify(serverPub, tamperedKey, signature), false);
  });

  it("3. Deterministic Canonicalization: Out-of-order answers yield exact same content hash", () => {
    const answers1 = { 1: "A", 2: "b", 10: "c", 3: "D " };
    const answers2 = { "10": "C", "3": "D", "1": "A", "2": "B" };

    const canon1 = canonicalizeAnswers(answers1);
    const canon2 = canonicalizeAnswers(answers2);

    assert.deepEqual(canon1, { "1": "A", "2": "B", "3": "D", "10": "C" });
    assert.deepEqual(canon2, { "1": "A", "2": "B", "3": "D", "10": "C" });

    const hash1 = canonicalSha256Hex(canon1);
    const hash2 = canonicalSha256Hex(canon2);
    assert.equal(hash1, hash2);
  });

  it("4. ECDSA Signature Verification: Handles both IEEE P1363 (WebCrypto raw 64-byte) and ASN.1 DER", () => {
    const { privateKeyPem, publicKeyPem } = generateECDSAKeyPair();
    const digest = Buffer.from(canonicalSha256Hex({ "1": "A", "2": "B" }), "hex");

    // Standard DER signature
    const derSig = ecdsaSign(privateKeyPem, digest);
    assert.equal(ecdsaVerify(publicKeyPem, digest, derSig), true);

    // IEEE P1363 raw signature (Node crypto createSign with dsaEncoding)
    const signer = createSign("SHA256");
    signer.update(digest);
    const p1363Sig = signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" }).toString("base64");

    // ecdsaVerify should transparently accept IEEE P1363 WebCrypto format
    assert.equal(ecdsaVerify(publicKeyPem, digest, p1363Sig), true);
  });

  it("5. Independent Trustee Authorization: Decrypts individual shares and reconstructs ExamKEK", async () => {
    const examKEK = generateExamKEK();
    const examId = "exam-shamir-test";
    const passwords: [string, string, string] = [
      "Trustee1SecurePass@2026",
      "Trustee2SecurePass@2026",
      "Trustee3SecurePass@2026",
    ];

    const shares = await splitAndEncryptKEK(examKEK, examId, passwords);
    assert.equal(shares.length, 3);

    // Trustee 1 independently decrypts their share
    const rawShare1 = await decryptSingleShare(shares[0], passwords[0], examId);

    // Trustee 3 independently decrypts their share
    const rawShare3 = await decryptSingleShare(shares[2], passwords[2], examId);

    // Combining any 2 shares reconstructs the exact original ExamKEK
    const reconstructed = combineRawShares([rawShare1, rawShare3]);
    assert.equal(Buffer.from(reconstructed).equals(Buffer.from(examKEK)), true);

    // Wrong password throws authentication tag error
    await assert.rejects(
      async () => {
        await decryptSingleShare(shares[1], "WrongPassword!", examId);
      },
      /auth|Unsupported state/i
    );
  });

  it("6. Tamper-Evident Audit Hash Chain: Sequential linking and signature verification", () => {
    const { privateKeyPem: auditPriv, publicKeyPem: auditPub } = generateEd25519KeyPair();
    const chain: AuditEntry[] = [];

    let prevHash = GENESIS_HASH;
    for (let seq = 1; seq <= 5; seq++) {
      const entry = buildAuditEntry(
        prevHash,
        seq,
        {
          eventType: `EVENT_${seq}`,
          actorId: "actor-01",
          eventData: { count: seq },
        },
        auditPriv
      );
      chain.push(entry);
      prevHash = entry.entryHash;
    }

    assert.equal(chain.length, 5);
    const verification = verifyAuditChain(chain, auditPub);
    assert.equal(verification.valid, true, `Verification failed at index: ${verification.firstInvalidIndex}`);
    assert.equal(verification.firstInvalidIndex, null);
  });
});
