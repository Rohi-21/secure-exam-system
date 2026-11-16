/**
 * POST /api/exam/[id]/reveal-commitment
 * Post-exam commitment reveal — proves the answer key was fixed before the exam opened.
 *
 * The examiner provides the plaintext answer key + salt (from their local notes).
 * Server verifies: SHA-256(canonical + salt) === stored_commitment
 * On success: stores the salt in DB (revealedAt timestamp set)
 *
 * Any student, examiner, or auditor can then independently verify the commitment
 * using the publicly published commitment hash + the now-revealed salt.
 *
 * Body: { answers: { "1": "B", ... }, salt: string (hex) }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCommitment } from "@/lib/crypto/commitment";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const examinerId = req.headers.get("x-user-id")!;
    const role = req.headers.get("x-user-role");
    const { id: examId } = await params;

    const actorId = req.headers.get("x-user-id");

    if (!["examiner", "admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    if (role === "examiner" && exam.createdById !== actorId) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to reveal commitment for this exam" }, { status: 403 });
    }

    const { answers, salt } = await req.json();
    if (!answers || !salt) {
      return NextResponse.json({ error: "answers and salt required" }, { status: 400 });
    }

    // ── Fetch stored commitment ───────────────────────────────────────
    const answerKey = await prisma.answerKey.findUnique({ where: { examId } });
    if (!answerKey) {
      return NextResponse.json({ error: "Answer key not found" }, { status: 404 });
    }
    if (answerKey.revealedAt) {
      return NextResponse.json({
        message: "Commitment already revealed.",
        revealedAt: answerKey.revealedAt,
        commitment: answerKey.commitment,
      });
    }

    // ── Verify commitment ─────────────────────────────────────────────
    const isValid = verifyCommitment(answerKey.commitment, examId, answers, salt);
    if (!isValid) {
      return NextResponse.json(
        {
          error: "Commitment verification FAILED. The provided answers or salt do not match the pre-published commitment.",
          storedCommitment: answerKey.commitment,
        },
        { status: 400 }
      );
    }

    // ── Store salt + reveal timestamp ─────────────────────────────────
    const revealedAt = new Date();
    await prisma.answerKey.update({
      where: { examId },
      data: { commitmentSalt: salt, revealedAt },
    });

    return NextResponse.json({
      message: "Commitment verified and revealed. Answer key integrity confirmed.",
      examId,
      commitment: answerKey.commitment,
      salt,
      revealedAt: revealedAt.toISOString(),
      verificationStatus: "VALID ✓",
    });

  } catch (err) {
    console.error("[reveal-commitment]", err);
    return NextResponse.json({ error: "Reveal failed" }, { status: 500 });
  }
}

/**
 * GET /api/exam/[id]/reveal-commitment
 * Public — anyone can fetch the commitment + salt (once revealed) to self-verify.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: examId } = await params;
    const answerKey = await prisma.answerKey.findUnique({
      where: { examId },
      select: { commitment: true, commitmentSalt: true, revealedAt: true },
    });

    if (!answerKey) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      examId,
      commitment: answerKey.commitment,
      salt: answerKey.revealedAt ? answerKey.commitmentSalt : null,
      revealedAt: answerKey.revealedAt ?? null,
      status: answerKey.revealedAt ? "revealed" : "pending",
    });
  } catch (err) {
    console.error("[reveal GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
