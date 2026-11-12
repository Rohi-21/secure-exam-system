/**
 * POST /api/exam/[id]/upload-answers
 * Examiner uploads the answer key BEFORE the exam starts.
 * Flow:
 *   1. Canonical JSON answer key is built (sorted keys, deterministic)
 *   2. Commitment = SHA-256(canonical + salt) is computed
 *   3. Commitment is returned to examiner for external publication (email/Gist)
 *      — this MUST happen before the exam opens to be meaningful
 *   4. Answer key + salt are encrypted with envelope encryption under ExamKEK
 *   5. Salt stored encrypted (revealed post-exam via /reveal-commitment)
 *
 * Body: { examKEKb64: string, answers: { "1": "B", "2": "A", ... } }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { envelopeEncrypt } from "@/lib/crypto/envelope";
import { generateCommitment, canonicaliseAnswerKey } from "@/lib/crypto/commitment";
import type { EncryptionAAD } from "@/lib/crypto/aes";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const examinerId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");
    const { id: examId } = await params;

    if (!["examiner", "admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { examKEKb64, answers } = await req.json();

    if (!examKEKb64 || !answers || typeof answers !== "object") {
      return NextResponse.json({ error: "examKEKb64 and answers object required" }, { status: 400 });
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.createdById !== examinerId) {
      return NextResponse.json({ error: "Exam not found or not owned by you" }, { status: 404 });
    }

    const examKEK = Buffer.from(examKEKb64, "base64");
    if (examKEK.length !== 32) {
      return NextResponse.json({ error: "Invalid ExamKEK" }, { status: 400 });
    }

    // ── Generate commitment (BEFORE encrypting) ────────────────────────
    const { commitment, salt } = generateCommitment(examId, answers);

    // ── Build canonical plaintext payload ─────────────────────────────
    const canonical = canonicaliseAnswerKey(examId, answers);
    // Store: canonical JSON + salt hex together so reveal can verify
    const plaintext = JSON.stringify({ canonical, salt, examId });

    const aad: EncryptionAAD = {
      record_id: `${examId}-answer-key`,
      record_type: "answer_key",
      exam_id: examId,
      key_version: 1,
      algorithm: "AES-256-GCM",
    };

    const encrypted = envelopeEncrypt(examKEK, plaintext, aad, examId);

    // ── Upsert AnswerKey record ───────────────────────────────────────
    await prisma.answerKey.upsert({
      where: { examId },
      create: {
        examId,
        ciphertext: encrypted.ciphertext,
        authTag: encrypted.authTag,
        iv: encrypted.iv,
        aad: encrypted.aad,
        wrappedDEK: encrypted.wrappedDEK,
        dekIv: encrypted.dekIv,
        dekAuthTag: encrypted.dekAuthTag,
        keyVersion: 1,
        commitment,     // stored for public verification
        algorithm: "AES-256-GCM",
      },
      update: {
        ciphertext: encrypted.ciphertext,
        authTag: encrypted.authTag,
        iv: encrypted.iv,
        aad: encrypted.aad,
        wrappedDEK: encrypted.wrappedDEK,
        dekIv: encrypted.dekIv,
        dekAuthTag: encrypted.dekAuthTag,
        commitment,
      },
    });

    // ExamKEK and salt leave scope here
    return NextResponse.json({
      message: "Answer key encrypted and committed.",
      commitment,
      // IMPORTANT: Examiner must publish this commitment publicly NOW
      // (email to students + GitHub Gist) before the exam opens.
      action_required: "Publish the commitment value externally BEFORE opening the exam.",
    });

  } catch (err) {
    console.error("[upload-answers]", err);
    return NextResponse.json({ error: "Answer upload failed" }, { status: 500 });
  }
}
