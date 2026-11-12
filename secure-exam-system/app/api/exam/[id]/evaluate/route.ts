/**
 * POST /api/exam/[id]/evaluate
 * Auto-grader — runs after exam closes and ExamKEK is reconstructed.
 *
 * Flow:
 *   1. Fetch and decrypt all submissions using ExamKEK
 *   2. Fetch and decrypt answer key using ExamKEK
 *   3. Grade each submission (MCQ: exact match per question)
 *   4. Encrypt result for each student (new DEK per result, wrapped with ExamKEK)
 *   5. Sign the result hash with server Ed25519 key (represents examiner authority)
 *      — In a fully deployed system, examiner would sign in browser
 *   6. Store encrypted results + examiner signature in DB
 *
 * Idempotent — safe to call multiple times (upserts results).
 * Caller: examiner | admin | hod
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { envelopeDecrypt, envelopeEncrypt } from "@/lib/crypto/envelope";
import { sha256Hex } from "@/lib/crypto/hash";
import { ed25519Sign } from "@/lib/crypto/ed25519";
import { examKEKCache } from "../questions/route";
import type { EncryptionAAD } from "@/lib/crypto/aes";

interface GradedResult {
  studentId: string;
  submissionId: string;
  score: number;
  totalQuestions: number;
  correct: number;
  incorrect: number;
  details: Record<string, { given: string; correct: string; isCorrect: boolean }>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actorId = req.headers.get("x-user-id")!;
    const role = req.headers.get("x-user-role");
    const { id: examId } = await params;

    if (!["examiner", "admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Validate exam state ───────────────────────────────────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    if (exam.status === "draft" || exam.status === "active") {
      return NextResponse.json(
        { error: "Exam must be closed before evaluation. Update status to 'closed' first." },
        { status: 400 }
      );
    }

    // ── Get cached ExamKEK ────────────────────────────────────────────
    const examKEK = examKEKCache.get(examId);
    if (!examKEK) {
      return NextResponse.json(
        { error: "ExamKEK not in cache. Run /api/keys/reconstruct or /api/keys/cache-kek first." },
        { status: 503 }
      );
    }

    // ── Decrypt answer key ────────────────────────────────────────────
    const answerKeyRecord = await prisma.answerKey.findUnique({ where: { examId } });
    if (!answerKeyRecord) {
      return NextResponse.json({ error: "Answer key not found" }, { status: 404 });
    }

    const answerKeyAAD: EncryptionAAD = {
      record_id: `${examId}-answer-key`,
      record_type: "answer_key",
      exam_id: examId,
      key_version: answerKeyRecord.keyVersion,
      algorithm: "AES-256-GCM",
    };

    const answerKeyBuf = envelopeDecrypt(examKEK, {
      ciphertext: answerKeyRecord.ciphertext,
      authTag: answerKeyRecord.authTag,
      iv: answerKeyRecord.iv,
      aad: answerKeyRecord.aad,
      wrappedDEK: answerKeyRecord.wrappedDEK,
      dekIv: answerKeyRecord.dekIv,
      dekAuthTag: answerKeyRecord.dekAuthTag,
    }, answerKeyAAD, examId);

    const { canonical } = JSON.parse(answerKeyBuf.toString("utf-8"));
    const answerKeyParsed = JSON.parse(canonical) as {
      exam_id: string;
      version: number;
      answers: Record<string, string>;
    };
    const correctAnswers = answerKeyParsed.answers;

    // ── Fetch all submissions + their DEKs ────────────────────────────
    const submissions = await prisma.submission.findMany({
      where: { examId },
      include: { dek: true },
    });

    if (submissions.length === 0) {
      return NextResponse.json({ message: "No submissions to evaluate.", count: 0 });
    }

    // ── Grade each submission ─────────────────────────────────────────
    const auditPrivKey = process.env.AUDIT_ED25519_PRIVATE_KEY_PEM ?? "";
    const totalQuestions = Object.keys(correctAnswers).length;
    const gradedResults: GradedResult[] = [];

    const resultUpserts = await Promise.all(submissions.map(async (sub) => {
      // Decrypt submission
      const subAAD: EncryptionAAD = {
        record_id: sub.id,
        record_type: "submission",
        exam_id: examId,
        user_id: sub.studentId,
        key_version: sub.keyVersion,
        algorithm: "AES-256-GCM",
      };

      const plainBuf = envelopeDecrypt(examKEK, {
        ciphertext: sub.ciphertext,
        authTag: sub.authTag,
        iv: sub.iv,
        aad: sub.aad,
        wrappedDEK: sub.dek!.wrappedDEK,
        dekIv: sub.dek!.dekIv,
        dekAuthTag: sub.dek!.dekAuthTag,
      }, subAAD, examId);

      const givenAnswers: Record<string, string> = JSON.parse(plainBuf.toString("utf-8"));

      // Grade
      let correct = 0;
      const details: GradedResult["details"] = {};
      for (const [qNo, correctAns] of Object.entries(correctAnswers)) {
        const given = givenAnswers[qNo] ?? "";
        const isCorrect = given.toUpperCase() === correctAns.toUpperCase();
        if (isCorrect) correct++;
        details[qNo] = { given, correct: correctAns, isCorrect };
      }
      const incorrect = totalQuestions - correct;
      const score = Math.round((correct / totalQuestions) * 100);

      gradedResults.push({
        studentId: sub.studentId, submissionId: sub.id,
        score, totalQuestions, correct, incorrect, details,
      });

      // Encrypt result
      const resultId = crypto.randomUUID();
      const resultPayload = JSON.stringify({ score, totalQuestions, correct, incorrect, details });
      const resultAAD: EncryptionAAD = {
        record_id: resultId,
        record_type: "result",
        exam_id: examId,
        user_id: sub.studentId,
        key_version: 1,
        algorithm: "AES-256-GCM",
      };
      const encResult = envelopeEncrypt(examKEK, resultPayload, resultAAD, examId);

      // Sign the result ciphertext hash with server Ed25519 key
      const resultCipherHash = sha256Hex(Buffer.from(encResult.ciphertext, "base64"));
      const examinerSignature = auditPrivKey
        ? ed25519Sign(auditPrivKey, Buffer.from(resultCipherHash, "hex"))
        : "no-signing-key-configured";

      return prisma.result.upsert({
        where: { submissionId: sub.id },
        create: {
          id: resultId,
          submissionId: sub.id,
          studentId: sub.studentId,
          examId,
          ciphertext: encResult.ciphertext,
          authTag: encResult.authTag,
          iv: encResult.iv,
          aad: encResult.aad,
          algorithm: "AES-256-GCM",
          keyVersion: 1,
          examinerSignature,
          dek: {
            create: {
              wrappedDEK: encResult.wrappedDEK,
              dekIv: encResult.dekIv,
              dekAuthTag: encResult.dekAuthTag,
              keyVersion: 1,
            },
          },
        },
        update: {
          ciphertext: encResult.ciphertext, authTag: encResult.authTag, iv: encResult.iv,
          aad: encResult.aad, examinerSignature,
        },
      });
    }));

    // ── Update exam status ────────────────────────────────────────────
    await prisma.exam.update({ where: { id: examId }, data: { status: "revealed" } });

    return NextResponse.json({
      message: `Evaluated ${resultUpserts.length} submissions.`,
      count: resultUpserts.length,
      summary: gradedResults.map(({ studentId, score, correct, totalQuestions }) => ({
        studentId, score, correct, totalQuestions,
      })),
    });

  } catch (err) {
    console.error("[evaluate]", err);
    return NextResponse.json({ error: "Evaluation failed" }, { status: 500 });
  }
}
