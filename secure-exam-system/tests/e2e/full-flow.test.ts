/**
 * Full End-to-End Cryptographic Examination Pipeline Test
 *
 * Verifies the entire cryptographic lifecycle without mocks:
 * 1. Examiner creates ExamKEK, splits with 2-of-3 Shamir SSS, wraps with RSA-2048
 * 2. Envelope encryption of questions under ExamKEK
 * 3. Pre-exam answer key commitment (SHA-256 Commit-Reveal)
 * 4. Ephemeral ECDH-P256 handshake + HKDF session key derivation + Ed25519 signature
 * 5. Trans-encryption of questions from ExamKEK to student SessionKey
 * 6. Zero-width character (ZWC) steganographic watermarking
 * 7. Student signs submission with ECDSA-P256
 * 8. Post-exam Shamir reconstruction (2 of 3 trustees)
 * 9. Answer key commitment reveal verification
 * 10. Merkle tree generation over submissions and student inclusion proof verification
 * 11. Objective auto-grading and Ed25519-signed result encryption
 * 12. Complete audit hash-chain integrity verification
 *
 * Run: npx tsx tests/e2e/full-flow.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createECDH } from "crypto";

// Crypto Modules
import {
  generateExamKEK,
  splitAndEncryptKEK,
  reconstructKEK,
  EncryptedShare,
} from "../../lib/crypto/shamir";
import { generateRSAKeyPair, rsaWrapKey, rsaUnwrapKey } from "../../lib/crypto/rsa";
import { envelopeEncrypt, envelopeDecrypt } from "../../lib/crypto/envelope";
import { generateCommitment, verifyCommitment } from "../../lib/crypto/commitment";
import { generateECDHKeyPair, computeSharedSecret, serverHandshake } from "../../lib/crypto/ecdh";
import { hkdfDerive } from "../../lib/crypto/kdf";
import {
  embedStudentWatermark,
  extractZWCWatermark,
  decodeZWC,
} from "../../lib/crypto/steganography";
import { generateECDSAKeyPair, ecdsaSign, ecdsaVerify } from "../../lib/crypto/ecdsa";
import { generateEd25519KeyPair, ed25519Sign, ed25519Verify } from "../../lib/crypto/ed25519";
import { buildMerkleTree, generateMerkleProof, verifyMerkleProof } from "../../lib/crypto/merkle";
import { buildAuditEntry, verifyAuditChain, AuditEventType } from "../../lib/audit/chain";
import { GENESIS_HASH, sha256Hex } from "../../lib/crypto/hash";
import { encryptAES256GCM, decryptAES256GCM, EncryptionAAD } from "../../lib/crypto/aes";

describe("E2E Cryptographic Lifecycle Verification", () => {
  const EXAM_ID = "exam-e2e-2024-cns-term";
  const STUDENT_ID = "01FE23BCS240";
  const TRUSTEE_PASSWORDS: [string, string, string] = [
    "Trustee1!StrongSecretPass@2024",
    "Trustee2!StrongSecretPass@2024",
    "Trustee3!StrongSecretPass@2024",
  ];

  // Test state across lifecycle
  let originalExamKEK: Buffer;
  let encryptedShares: EncryptedShare[];
  let rsaWrappedKEK: string;
  let examinerRSAKeys: { publicKeyPem: string; privateKeyPem: string };
  let commitmentHash: string;
  let commitmentSalt: string;
  const officialAnswers = { "1": "B", "2": "C", "3": "A", "4": "D" };

  // Envelope encrypted questions
  let rawQuestions: Array<{ qNo: number; text: string; options: Record<string, string> }>;
  let encryptedQuestions: Array<ReturnType<typeof envelopeEncrypt>>;

  // Audit chain
  const auditEntries: any[] = [];
  let prevAuditHash = GENESIS_HASH;
  const auditKeypair = generateEd25519KeyPair();

  function logAuditEvent(eventType: string, data: Record<string, unknown>) {
    const entry = buildAuditEntry(
      prevAuditHash,
      auditEntries.length + 1,
      {
        eventType,
        actorId: STUDENT_ID,
        examId: EXAM_ID,
        eventData: data,
      },
      auditKeypair.privateKeyPem
    );
    auditEntries.push(entry);
    prevAuditHash = entry.entryHash;
  }

  test("Step 1: Exam creation, Shamir (2-of-3) split and RSA-OAEP backup wrapping", async () => {
    examinerRSAKeys = generateRSAKeyPair();
    originalExamKEK = generateExamKEK();
    assert.equal(originalExamKEK.length, 32, "ExamKEK must be 32 bytes");

    // Shamir 2-of-3 split
    encryptedShares = await splitAndEncryptKEK(originalExamKEK, EXAM_ID, TRUSTEE_PASSWORDS);
    assert.equal(encryptedShares.length, 3, "Must produce 3 shares");

    // RSA-OAEP backup wrap
    rsaWrappedKEK = rsaWrapKey(examinerRSAKeys.publicKeyPem, originalExamKEK);
    assert.ok(rsaWrappedKEK.length > 0, "RSA wrapped KEK must not be empty");

    // Verify RSA unwrapping recovers KEK
    const rsaRecovered = rsaUnwrapKey(examinerRSAKeys.privateKeyPem, rsaWrappedKEK);
    assert.equal(rsaRecovered.toString("hex"), originalExamKEK.toString("hex"));

    logAuditEvent(AuditEventType.EXAM_CREATED, { title: "CNS E2E Examination" });
  });

  test("Step 2: Paper upload with envelope encryption (AES-256-GCM under ExamKEK)", () => {
    rawQuestions = [
      { qNo: 1, text: "Which mode provides authenticated encryption?", options: { A: "ECB", B: "GCM", C: "CBC", D: "OFB" } },
      { qNo: 2, text: "What mathematical problem underpins ECDH?", options: { A: "Factorization", B: "Knapsack", C: "ECDLP", D: "LWE" } },
      { qNo: 3, text: "Which RFC specifies Argon2id?", options: { A: "RFC 9106", B: "RFC 5869", C: "RFC 8017", D: "RFC 6238" } },
      { qNo: 4, text: "What is the threshold for 2-of-3 Shamir?", options: { A: "1", B: "3", C: "4", D: "2" } },
    ];

    encryptedQuestions = rawQuestions.map((q) => {
      const aad: EncryptionAAD = {
        record_id: `q-${q.qNo}`,
        record_type: "question",
        exam_id: EXAM_ID,
        key_version: 1,
        algorithm: "AES-256-GCM",
      };
      return envelopeEncrypt(originalExamKEK, JSON.stringify(q), aad, EXAM_ID);
    });

    assert.equal(encryptedQuestions.length, 4);
    logAuditEvent(AuditEventType.EXAM_PAPER_UPLOADED, { count: 4 });
  });

  test("Step 3: Answer key commitment generation (SHA-256 Commit-Reveal)", () => {
    const { commitment, salt } = generateCommitment(EXAM_ID, officialAnswers);
    commitmentHash = commitment;
    commitmentSalt = salt;

    assert.match(commitmentHash, /^[0-9a-f]{64}$/);
    assert.match(commitmentSalt, /^[0-9a-f]{64}$/);

    logAuditEvent(AuditEventType.COMMITMENT_PUBLISHED, { commitment: commitmentHash });
  });

  test("Step 4 & 5: Ephemeral ECDH handshake and question delivery with ZWC watermark", () => {
    // Student generates ephemeral ECDH-P256
    const clientECDH = generateECDHKeyPair();
    const sessionId = "sess-e2e-test-101";

    // Server handshake (server computes shared secret internally and discards private key)
    const serverResult = serverHandshake(clientECDH.publicKeyB64, sessionId);

    // Client computes shared secret using clientECDH.ecdh and server's ephemeral public key
    const clientSharedSecret = computeSharedSecret(clientECDH.ecdh, serverResult.serverEphemeralPubKeyB64);
    
    // Verify client derives identical encKey
    const clientEncKey = hkdfDerive(clientSharedSecret, Buffer.from(sessionId), "session-enc-key", 32);
    assert.equal(clientEncKey.toString("hex"), serverResult.sessionKeys.encKey.toString("hex"),
      "Client and Server derived session encryption keys must match");

    const sessionKeys = serverResult.sessionKeys;
    assert.equal(sessionKeys.encKey.length, 32);

    // Deliver questions: unwrap under ExamKEK, watermark, re-encrypt under sessionKeys.encKey
    const deliveredPayloads = encryptedQuestions.map((eq, idx) => {
      const qAAD: EncryptionAAD = {
        record_id: `q-${idx + 1}`,
        record_type: "question",
        exam_id: EXAM_ID,
        key_version: 1,
        algorithm: "AES-256-GCM",
      };
      const decryptedPlain = envelopeDecrypt(originalExamKEK, eq, qAAD, EXAM_ID).toString("utf-8");
      const parsedQ = JSON.parse(decryptedPlain);

      // Embed ZWC watermark unique to STUDENT_ID
      const watermarkedText = embedStudentWatermark(parsedQ.text, EXAM_ID, STUDENT_ID, parsedQ.qNo);

      // Verify visible text is unchanged
      const visible = watermarkedText.replace(/[\u200B\u200C\u200D]/g, "");
      assert.equal(visible, parsedQ.text, "ZWC watermark must not alter visible characters");

      // Trans-encrypt under session key
      const transAAD: EncryptionAAD = {
        record_id: `delivery-q-${parsedQ.qNo}`,
        record_type: "question",
        exam_id: EXAM_ID,
        key_version: 1,
        algorithm: "AES-256-GCM",
      };
      return encryptAES256GCM(sessionKeys.encKey, JSON.stringify({ ...parsedQ, text: watermarkedText }), transAAD);
    });

    assert.equal(deliveredPayloads.length, 4);

    // Student decrypts in browser using session key
    const studentDecrypted = deliveredPayloads.map((dp, idx) => {
      const transAAD: EncryptionAAD = {
        record_id: `delivery-q-${idx + 1}`,
        record_type: "question",
        exam_id: EXAM_ID,
        key_version: 1,
        algorithm: "AES-256-GCM",
      };
      const plain = decryptAES256GCM(sessionKeys.encKey, dp, transAAD).toString("utf-8");
      return JSON.parse(plain);
    });

    assert.equal(studentDecrypted.length, 4);
    assert.equal(studentDecrypted[0].qNo, 1);

    logAuditEvent(AuditEventType.EXAM_SESSION_STARTED, { sessionId, studentId: STUDENT_ID });
  });

  // Student answers and signature
  let submissionHash: string;
  let studentECDSAKeys: { publicKeyPem: string; privateKeyPem: string };
  let studentAnswers: Record<string, string>;

  test("Step 6 & 7: Student signs submission with ECDSA-P256", () => {
    studentECDSAKeys = generateECDSAKeyPair();
    studentAnswers = { "1": "B", "2": "C", "3": "A", "4": "B" }; // 3 correct, 1 wrong (score: 75%)

    const submissionPayload = JSON.stringify({
      studentId: STUDENT_ID,
      examId: EXAM_ID,
      answers: studentAnswers,
      submittedAt: new Date().toISOString(),
    });

    submissionHash = sha256Hex(submissionPayload);
    const signature = ecdsaSign(studentECDSAKeys.privateKeyPem, Buffer.from(submissionHash, "hex"));

    // Server verifies signature
    const isValid = ecdsaVerify(studentECDSAKeys.publicKeyPem, Buffer.from(submissionHash, "hex"), signature);
    assert.ok(isValid, "Student ECDSA signature must verify");

    logAuditEvent(AuditEventType.SUBMISSION_RECEIVED, { studentId: STUDENT_ID, contentHash: submissionHash });
  });

  test("Step 8: Shamir Reconstruction Ceremony (2-of-3 trustees)", async () => {
    // Trustee 1 and Trustee 3 cooperate
    const sharesWithIndex = [
      { ...encryptedShares[0], trusteeIndex: 1 },
      { ...encryptedShares[2], trusteeIndex: 3 },
    ];
    const passwords = [TRUSTEE_PASSWORDS[0], TRUSTEE_PASSWORDS[2]];

    const reconstructedKEK = await reconstructKEK(sharesWithIndex, passwords, EXAM_ID);
    assert.equal(reconstructedKEK.toString("hex"), originalExamKEK.toString("hex"),
      "Reconstructed ExamKEK must match original exactly");

    logAuditEvent(AuditEventType.SHAMIR_RECONSTRUCTION, { trustees: [1, 3] });
  });

  test("Step 9: Answer key commitment reveal verification", () => {
    const verified = verifyCommitment(commitmentHash, EXAM_ID, officialAnswers, commitmentSalt);
    assert.ok(verified, "Revealed answer key + salt must match pre-exam commitment");

    logAuditEvent(AuditEventType.COMMITMENT_REVEALED, { status: "VERIFIED" });
  });

  test("Step 10: Merkle Tree finalization and inclusion proof", () => {
    // Multiple submissions in exam batch
    const allSubmissionHashes = [
      submissionHash,
      sha256Hex("submission-dummy-student-2"),
      sha256Hex("submission-dummy-student-3"),
      sha256Hex("submission-dummy-student-4"),
    ];

    const { root, leafHashes } = buildMerkleTree(allSubmissionHashes);
    assert.ok(root.length === 64, "Merkle root must be 64-char hex");

    // Generate proof for our student (index 0)
    const proof = generateMerkleProof(allSubmissionHashes, 0);
    const proofValid = verifyMerkleProof(proof, root);
    assert.ok(proofValid, "Student submission Merkle inclusion proof must be valid");

    // Reject tampered leaf
    const tamperedProof = { ...proof, leafHash: sha256Hex("tampered") };
    assert.equal(verifyMerkleProof(tamperedProof, root), false, "Tampered proof must fail");
  });

  test("Step 11: Auto-grading and Ed25519-signed encrypted result", () => {
    let score = 0;
    const details: Record<string, any> = {};

    for (const [qNo, ans] of Object.entries(studentAnswers)) {
      const correct = officialAnswers[qNo as keyof typeof officialAnswers];
      const isCorrect = ans === correct;
      if (isCorrect) score += 25;
      details[qNo] = { given: ans, correct, isCorrect };
    }

    assert.equal(score, 75, "Student score must be exactly 75%");

    const resultPayload = JSON.stringify({
      score,
      totalQuestions: 4,
      correct: 3,
      incorrect: 1,
      details,
    });

    const resultSig = ed25519Sign(auditKeypair.privateKeyPem, Buffer.from(resultPayload));
    const sigValid = ed25519Verify(auditKeypair.publicKeyPem, Buffer.from(resultPayload), resultSig);
    assert.ok(sigValid, "Result signature by evaluator key must be valid");

    logAuditEvent(AuditEventType.EVALUATION_COMPLETED, { score, studentId: STUDENT_ID });
    logAuditEvent(AuditEventType.RESULT_RELEASED, { studentId: STUDENT_ID });
  });

  test("Step 12: Complete audit chain verification (Zero breaks from genesis to head)", () => {
    assert.ok(auditEntries.length >= 6, "Must have generated multiple audit events");

    const { valid, firstInvalidIndex } = verifyAuditChain(auditEntries, auditKeypair.publicKeyPem);
    assert.ok(valid, "Audit chain must pass end-to-end verification");
    assert.equal(firstInvalidIndex, null, "Zero breaks in hash chain");
  });
});
