/**
 * POST /api/exam/[id]/upload-paper
 * Examiner uploads the question paper (array of MCQ questions).
 * Each question is encrypted individually using envelope encryption:
 *   DEK = randomBytes(32)
 *   ciphertext = AES-256-GCM(DEK, question_json, AAD)
 *   wrappedDEK = AES-256-GCM(ExamKEK, DEK, AAD)
 * ExamKEK is reconstructed via examiner's RSA private key (browser-side unwrap).
 * The unwrapped ExamKEK is sent in the request body — only over HTTPS.
 *
 * Body: {
 *   examKEKb64: string,         // RSA-unwrapped ExamKEK (base64), sent from browser
 *   questions: Array<{
 *     questionNo: number,
 *     text: string,
 *     optionA: string, optionB: string, optionC: string, optionD: string
 *   }>
 * }
 *
 * Steganographic watermark is embedded into question text using Unicode ZWC.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { envelopeEncrypt } from "@/lib/crypto/envelope";
import { embedZWCWatermark } from "@/lib/crypto/steganography";
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

    const { examKEKb64, questions } = await req.json();

    if (!examKEKb64) {
      return NextResponse.json({ error: "ExamKEK required (RSA-unwrapped from browser)" }, { status: 400 });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "questions array required" }, { status: 400 });
    }

    // ── Validate exam exists and belongs to this examiner ─────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.createdById !== examinerId) {
      return NextResponse.json({ error: "Exam not found or not owned by you" }, { status: 404 });
    }
    if (exam.status !== "draft") {
      return NextResponse.json({ error: "Cannot upload paper to a non-draft exam" }, { status: 400 });
    }

    const examKEK = Buffer.from(examKEKb64, "base64");
    if (examKEK.length !== 32) {
      return NextResponse.json({ error: "Invalid ExamKEK length" }, { status: 400 });
    }

    // ── Encrypt each question individually ────────────────────────────
    const encryptedQuestions = questions.map((q: {
      questionNo: number; text: string;
      optionA: string; optionB: string; optionC: string; optionD: string;
    }) => {
      const recordId = `${examId}-q${q.questionNo}`;

      // Embed Unicode ZWC watermark into question text (exam + question identifier)
      const watermarkedText = embedZWCWatermark(q.text, `${examId}:${q.questionNo}`);

      const plaintext = JSON.stringify({
        text: watermarkedText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
      });

      const aad: EncryptionAAD = {
        record_id: recordId,
        record_type: "question",
        exam_id: examId,
        key_version: 1,
        algorithm: "AES-256-GCM",
      };

      const encrypted = envelopeEncrypt(examKEK, plaintext, aad, examId);

      return {
        examId,
        questionNo: q.questionNo,
        ciphertext: encrypted.ciphertext,
        authTag: encrypted.authTag,
        iv: encrypted.iv,
        aad: encrypted.aad,
        wrappedDEK: encrypted.wrappedDEK,
        dekIv: encrypted.dekIv,
        dekAuthTag: encrypted.dekAuthTag,
        keyVersion: 1,
        algorithm: "AES-256-GCM",
      };
    });

    // ── Upsert all questions in a transaction ─────────────────────────
    await prisma.$transaction(
      encryptedQuestions.map((q) =>
        prisma.question.upsert({
          where: { examId_questionNo: { examId: q.examId, questionNo: q.questionNo } },
          create: q,
          update: q,
        })
      )
    );

    // ExamKEK leaves scope here
    return NextResponse.json({
      message: `${encryptedQuestions.length} question(s) encrypted and stored.`,
      count: encryptedQuestions.length,
    });

  } catch (err) {
    console.error("[upload-paper]", err);
    return NextResponse.json({ error: "Paper upload failed" }, { status: 500 });
  }
}
