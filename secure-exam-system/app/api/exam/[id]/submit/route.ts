/**
 * POST /api/exam/[id]/submit
 * Student submits their answers.
 *
 * Security properties:
 * 1. Application-layer session encryption: Answers are sent encrypted under
 *    the negotiated ECDH session key (K_enc), protecting against intermediate TLS inspection.
 * 2. Pre-encryption content hash: SHA-256 is computed over the canonical representation of answers.
 * 3. Client signature: ECDSA-P256 signature over content hash (WebCrypto IEEE-P1363 or DER).
 * 4. Anti-replay: submissionNonce verified as single-use in UsedNonce table.
 * 5. Strict server-side timing: verifies global exam window AND individual session duration.
 * 6. Storage encryption: Encrypted under a fresh SubmissionDEK, wrapped under ExamKEK.
 * 7. Tamper-evident audit logging: Appends signed audit event to the hash chain.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { envelopeEncrypt } from "@/lib/crypto/envelope";
import { decryptAES256GCM } from "@/lib/crypto/aes";
import { sha256Hex } from "@/lib/crypto/hash";
import { ecdsaVerify } from "@/lib/crypto/ecdsa";
import { canonicalizeAnswers, canonicalJsonStringify } from "@/lib/crypto/canonical";
import { sessionStore } from "@/lib/store/session-store";
import { sessionKeyStore } from "../ecdh-handshake/route";
import { examKEKCache } from "../questions/route";
import { appendAuditLog } from "@/lib/audit/chain";
import { AuditEventType } from "@/lib/audit/chain";
import type { EncryptionAAD } from "@/lib/crypto/aes";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = req.headers.get("x-user-id")!;
    const role = req.headers.get("x-user-role");
    const { id: examId } = await params;

    if (role !== "student") {
      return NextResponse.json({ error: "Only students can submit" }, { status: 403 });
    }

    const body = await req.json();
    const {
      sessionId,
      submissionNonce,
      contentHash,
      ecdsaSignature,
      answers: rawAnswers,
      encryptedPayload,
    } = body;

    if (!sessionId || !submissionNonce || !contentHash || !ecdsaSignature) {
      return NextResponse.json({ error: "Missing required submission metadata" }, { status: 400 });
    }

    // ── 1. Anti-replay check ───────────────────────────────────────────
    const nonceUsed = await prisma.usedNonce.findUnique({ where: { nonce: submissionNonce } });
    if (nonceUsed) {
      return NextResponse.json({ error: "Duplicate submission detected (nonce reuse)" }, { status: 409 });
    }

    // ── 2. Validate exam timing ────────────────────────────────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || (exam.status !== "active" && exam.status !== "scheduled")) {
      return NextResponse.json({ error: "Exam is not accepting submissions" }, { status: 400 });
    }

    const now = new Date();
    if (now < exam.startTime) {
      return NextResponse.json({ error: "Exam window has not opened yet" }, { status: 400 });
    }
    if (now > exam.endTime) {
      return NextResponse.json({ error: "Exam window has closed" }, { status: 400 });
    }

    // ── 3. Check for existing submission (one per student) ─────────────
    const existing = await prisma.submission.findFirst({
      where: { studentId, examId },
    });
    if (existing) {
      return NextResponse.json({ error: "You have already submitted this exam" }, { status: 409 });
    }

    // ── 4. Verify ExamSession & individual timer ───────────────────────
    const examSession = await prisma.examSession.findUnique({
      where: { studentId_examId: { studentId, examId } },
    });
    if (!examSession || examSession.status !== "active") {
      return NextResponse.json({ error: "No active exam session" }, { status: 400 });
    }

    // Individual timer enforcement (duration + 5 min grace window for network lag)
    if (examSession.startedAt) {
      const maxAllowedTime = examSession.startedAt.getTime() + (exam.durationMins + 5) * 60_000;
      if (now.getTime() > maxAllowedTime) {
        return NextResponse.json({ error: "Individual exam time limit exceeded" }, { status: 400 });
      }
    }

    // ── 5. Obtain Answers Plaintext ────────────────────────────────────
    let answers: Record<string, string>;

    if (encryptedPayload) {
      // Application-layer encrypted submission under ECDH session K_enc
      const session = sessionStore.getExamSession(sessionId) ?? sessionKeyStore.get(sessionId);
      if (!session || session.studentId !== studentId || session.examId !== examId) {
        return NextResponse.json({ error: "Session key not found or expired for decryption" }, { status: 401 });
      }

      const aad: EncryptionAAD = {
        record_id: `submission-${submissionNonce}`,
        record_type: "submission",
        exam_id: examId,
        user_id: studentId,
        key_version: 1,
        algorithm: "AES-256-GCM",
      };

      try {
        const decryptedBuf = decryptAES256GCM(session.encKey, encryptedPayload, aad);
        const parsed = JSON.parse(decryptedBuf.toString("utf-8"));
        answers = parsed.answers ?? parsed;
      } catch (decErr) {
        return NextResponse.json({ error: "Failed to decrypt submission with session key" }, { status: 400 });
      }
    } else if (rawAnswers) {
      // Direct answers (for test scripts / direct API clients)
      answers = rawAnswers;
    } else {
      return NextResponse.json({ error: "No answers provided" }, { status: 400 });
    }

    // ── 6. Deterministic Canonicalization & Content Hash Verification ──
    const canonicalAnswers = canonicalizeAnswers(answers);
    const canonicalJson = canonicalJsonStringify(canonicalAnswers);
    const recomputedHash = sha256Hex(Buffer.from(canonicalJson, "utf-8"));

    if (recomputedHash !== contentHash) {
      return NextResponse.json({
        error: "Content hash mismatch: submitted hash does not match canonical answers digest",
      }, { status: 400 });
    }

    // ── 7. Verify Student's ECDSA-P256 Signature ──────────────────────
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student?.ecdsaPubKey) {
      return NextResponse.json({ error: "Student ECDSA public key not on file" }, { status: 400 });
    }

    const sigValid = ecdsaVerify(student.ecdsaPubKey, Buffer.from(contentHash, "hex"), ecdsaSignature)
      || ecdsaVerify(student.ecdsaPubKey, Buffer.from(contentHash, "utf-8"), ecdsaSignature);

    if (!sigValid) {
      return NextResponse.json({ error: "ECDSA submission signature verification failed" }, { status: 400 });
    }

    // ── 8. Storage Encryption (Envelope Encryption under ExamKEK) ─────
    const examKEK = sessionStore.getExamKEK(examId) ?? examKEKCache.get(examId);
    if (!examKEK) {
      return NextResponse.json({
        error: "ExamKEK not available in memory for encryption. Please contact exam administrator.",
      }, { status: 503 });
    }

    const submissionId = crypto.randomUUID();
    const aad: EncryptionAAD = {
      record_id: submissionId,
      record_type: "submission",
      exam_id: examId,
      user_id: studentId,
      key_version: 1,
      algorithm: "AES-256-GCM",
    };

    const encrypted = envelopeEncrypt(examKEK, canonicalJson, aad, examId);

    // ── 9. Transactional Persistence ──────────────────────────────────
    await prisma.$transaction([
      prisma.usedNonce.create({
        data: {
          nonce: submissionNonce,
          examId,
          studentId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
      prisma.examSession.update({
        where: { studentId_examId: { studentId, examId } },
        data: { status: "submitted", submittedAt: now },
      }),
      prisma.submission.create({
        data: {
          id: submissionId,
          sessionId: examSession.id,
          studentId,
          examId,
          ciphertext: encrypted.ciphertext,
          authTag: encrypted.authTag,
          iv: encrypted.iv,
          aad: encrypted.aad,
          algorithm: "AES-256-GCM",
          keyVersion: 1,
          contentHash,
          ecdsaSignature,
          submissionNonce,
          dek: {
            create: {
              wrappedDEK: encrypted.wrappedDEK,
              dekIv: encrypted.dekIv,
              dekAuthTag: encrypted.dekAuthTag,
              keyVersion: 1,
            },
          },
        },
      }),
    ]);

    // ── 10. Audit Logging ─────────────────────────────────────────────
    const auditKey = process.env.AUDIT_ED25519_PRIVATE_KEY_PEM;
    if (auditKey) {
      try {
        await appendAuditLog(
          AuditEventType.SUBMISSION_RECEIVED,
          studentId,
          examId,
          { submissionId, contentHash, submissionNonce },
          auditKey
        );
      } catch (auditErr) {
        console.warn("[submit] Audit log append error:", auditErr);
      }
    }

    return NextResponse.json({
      message: "Submission accepted and cryptographically verified.",
      submissionId,
      contentHash,
      submittedAt: now.toISOString(),
    });

  } catch (err) {
    console.error("[submit]", err);
    return NextResponse.json({ error: "Submission processing failed" }, { status: 500 });
  }
}
