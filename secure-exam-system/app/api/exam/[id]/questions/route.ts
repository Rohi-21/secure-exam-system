/**
 * GET /api/exam/[id]/questions
 * Delivers encrypted questions over the ECDH session channel.
 * Questions are decrypted server-side (ExamKEK → DEK → plaintext),
 * then re-encrypted with the student's session K_enc key before transmission.
 *
 * This provides a double layer: TLS + application-layer ECDH session key.
 *
 * Headers:
 *   x-exam-session-id — the session ID from the ECDH handshake (or x-session-id)
 *   Authorization     — Bearer JWT
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { envelopeDecrypt } from "@/lib/crypto/envelope";
import { encryptAES256GCM } from "@/lib/crypto/aes";
import { sessionKeyStore } from "../ecdh-handshake/route";
import { sessionStore } from "@/lib/store/session-store";
import type { EncryptionAAD } from "@/lib/crypto/aes";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = req.headers.get("x-user-id");
    const sessionId =
      req.headers.get("x-exam-session-id") ??
      req.headers.get("x-session-id") ??
      req.nextUrl.searchParams.get("sessionId") ??
      "";
    const { id: examId } = await params;

    // ── Validate exam timing and status ───────────────────────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    const now = new Date();
    if (exam.status !== "active" && exam.status !== "scheduled") {
      return NextResponse.json({ error: "Exam is not currently active" }, { status: 400 });
    }
    if (now < exam.startTime || now > exam.endTime) {
      return NextResponse.json({ error: "Exam window is closed" }, { status: 400 });
    }

    // ── Validate session ──────────────────────────────────────────────
    const session = sessionStore.getExamSession(sessionId) ?? sessionKeyStore.get(sessionId);
    if (!session || session.studentId !== studentId || session.examId !== examId) {
      return NextResponse.json(
        { error: "Invalid or expired exam session. Run ECDH handshake first." },
        { status: 401 }
      );
    }

    // ── Fetch questions from DB ───────────────────────────────────────
    const questions = await prisma.question.findMany({
      where: { examId },
      orderBy: { questionNo: "asc" },
    });

    if (questions.length === 0) {
      return NextResponse.json({ error: "No questions found for this exam" }, { status: 404 });
    }

    // ── Need ExamKEK to decrypt questions ─────────────────────────────
    const cachedKEK = sessionStore.getExamKEK(examId) ?? examKEKCache.get(examId);
    if (!cachedKEK) {
      return NextResponse.json(
        { error: "ExamKEK not in server cache. Examiner must run /api/keys/cache-kek or complete Shamir reconstruction first." },
        { status: 503 }
      );
    }
    const examKEK = cachedKEK;

    // ── Decrypt each question, re-encrypt with session K_enc ──────────
    const deliveredQuestions = questions.map((q) => {
      const aad: EncryptionAAD = {
        record_id: `${examId}-q${q.questionNo}`,
        record_type: "question",
        exam_id: examId,
        key_version: q.keyVersion,
        algorithm: "AES-256-GCM",
      };

      // Decrypt with ExamKEK
      const plainBuf = envelopeDecrypt(
        examKEK,
        {
          ciphertext: q.ciphertext,
          authTag: q.authTag,
          iv: q.iv,
          aad: q.aad,
          wrappedDEK: q.wrappedDEK,
          dekIv: q.dekIv,
          dekAuthTag: q.dekAuthTag,
        },
        aad,
        examId
      );

      // Re-encrypt with student's ECDH session key
      const sessionAAD: EncryptionAAD = {
        record_id: `session-${sessionId}-q${q.questionNo}`,
        record_type: "question",
        exam_id: examId,
        user_id: studentId!,
        key_version: 1,
        algorithm: "AES-256-GCM",
      };
      const sessionEncrypted = encryptAES256GCM(session.encKey, plainBuf, sessionAAD);

      return {
        questionNo: q.questionNo,
        ciphertext: sessionEncrypted.ciphertext,
        authTag: sessionEncrypted.authTag,
        iv: sessionEncrypted.iv,
        aad: sessionEncrypted.aad,
      };
    });

    return NextResponse.json({
      questions: deliveredQuestions,
      total: deliveredQuestions.length,
      durationMins: exam.durationMins,
      startTime: exam.startTime.toISOString(),
      endTime: exam.endTime.toISOString(),
      serverTime: now.toISOString(),
    });

  } catch (err) {
    console.error("[questions]", err);
    return NextResponse.json({ error: "Question delivery failed" }, { status: 500 });
  }
}

// ── In-process ExamKEK cache (set by /api/keys/cache-kek or Shamir reconstruction)
export const examKEKCache = new Map<string, Buffer>();
