/**
 * POST /api/exam/[id]/submit
 * Student submits their answers.
 *
 * Security properties:
 * 1. Submission is AES-256-GCM encrypted (DEK wrapped with ExamKEK)
 * 2. Content hash (SHA-256) of plaintext is computed BEFORE encryption
 * 3. ECDSA-P256 signature over content hash is verified server-side
 *    (signature was computed in browser with student's non-exportable key)
 * 4. Anti-replay: submissionNonce is unique per submission (checked in UsedNonce)
 * 5. Only one submission allowed per student per exam
 *
 * Body: {
 *   sessionId: string,
 *   answers: { "1": "B", "2": "C", ... },   // plaintext — encrypted server-side
 *   contentHash: string,                      // SHA-256(canonical answers JSON) hex
 *   ecdsaSignature: string,                   // base64 ECDSA-P256 sig of contentHash
 *   submissionNonce: string,                  // random hex, one-time use
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { envelopeEncrypt } from "@/lib/crypto/envelope";
import { sha256Hex } from "@/lib/crypto/hash";
import { ecdsaVerify } from "@/lib/crypto/ecdsa";
import { examKEKCache } from "../questions/route";
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

    const { sessionId, answers, contentHash, ecdsaSignature, submissionNonce } = await req.json();

    if (!answers || !contentHash || !ecdsaSignature || !submissionNonce || !sessionId) {
      return NextResponse.json({ error: "Missing required submission fields" }, { status: 400 });
    }

    // ── Anti-replay: check nonce ──────────────────────────────────────
    const nonceUsed = await prisma.usedNonce.findUnique({ where: { nonce: submissionNonce } });
    if (nonceUsed) {
      return NextResponse.json({ error: "Duplicate submission detected (nonce reuse)" }, { status: 409 });
    }

    // ── Validate exam timing ──────────────────────────────────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || (exam.status !== "active" && exam.status !== "scheduled")) {
      return NextResponse.json({ error: "Exam is not accepting submissions" }, { status: 400 });
    }
    if (new Date() > exam.endTime) {
      return NextResponse.json({ error: "Exam window has closed" }, { status: 400 });
    }

    // ── Check for existing submission (one per student) ───────────────
    const existing = await prisma.submission.findFirst({
      where: { studentId, examId },
    });
    if (existing) {
      return NextResponse.json({ error: "You have already submitted" }, { status: 409 });
    }

    // ── Verify ExamSession ────────────────────────────────────────────
    const examSession = await prisma.examSession.findUnique({
      where: { studentId_examId: { studentId, examId } },
    });
    if (!examSession || examSession.status !== "active") {
      return NextResponse.json({ error: "No active exam session" }, { status: 400 });
    }

    // ── Verify content hash ───────────────────────────────────────────
    const canonical = JSON.stringify(
      Object.fromEntries(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)))
    );
    const recomputedHash = sha256Hex(Buffer.from(canonical, "utf-8"));
    if (recomputedHash !== contentHash) {
      return NextResponse.json({ error: "Content hash mismatch" }, { status: 400 });
    }

    // ── Verify ECDSA-P256 signature ───────────────────────────────────
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student?.ecdsaPubKey) {
      return NextResponse.json({ error: "Student ECDSA key not on file" }, { status: 400 });
    }

    // Convert SPKI base64 public key to PEM for Node.js crypto
    const pubKeyPem = `-----BEGIN PUBLIC KEY-----\n${student.ecdsaPubKey.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const sigValid = ecdsaVerify(pubKeyPem, Buffer.from(contentHash, "hex"), ecdsaSignature);
    if (!sigValid) {
      return NextResponse.json({ error: "ECDSA signature verification failed" }, { status: 400 });
    }

    // ── Encrypt submission ────────────────────────────────────────────
    const examKEK = examKEKCache.get(examId);
    if (!examKEK) {
      return NextResponse.json({ error: "ExamKEK not cached. Contact invigilator." }, { status: 503 });
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

    const encrypted = envelopeEncrypt(examKEK, canonical, aad, examId);

    // ── Persist in a transaction ──────────────────────────────────────
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
        data: { status: "submitted", submittedAt: new Date() },
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

    return NextResponse.json({
      message: "Submission accepted and encrypted.",
      submissionId,
      contentHash, // Student can record this as their receipt
    });

  } catch (err) {
    console.error("[submit]", err);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
