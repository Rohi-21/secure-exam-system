/**
 * POST /api/keys/reconstruct
 * Shamir Secret Sharing reconstruction ceremony.
 *
 * Two trustees (out of three) each provide their password.
 * The server decrypts their shares, combines them, and reconstructs the ExamKEK.
 * The ExamKEK is cached in-process for the exam duration — NEVER stored to DB.
 *
 * Security properties:
 *   ✅ No single administrator can reconstruct alone (threshold = 2)
 *   ✅ DB breach alone is insufficient (shares are Argon2id-encrypted)
 *   ⚠️  Reconstructed key exists in RAM during this call and while cached
 *   ⚠️  Requires two cooperating trustees — collusion of both defeats Shamir
 *
 * Body: {
 *   examId: string,
 *   trustees: [
 *     { trusteeId: string, password: string },
 *     { trusteeId: string, password: string }
 *   ]
 * }
 * Caller must be: admin | hod | examiner (enforced by middleware RBAC)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reconstructKEK } from "@/lib/crypto/shamir";
import { examKEKCache } from "@/app/api/exam/[id]/questions/route";

export async function POST(req: NextRequest) {
  try {
    const actorId = req.headers.get("x-user-id")!;
    const role = req.headers.get("x-user-role");

    if (!["admin", "hod", "examiner"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { examId, trustees } = await req.json();

    if (!examId || !Array.isArray(trustees) || trustees.length < 2) {
      return NextResponse.json(
        { error: "examId and at least 2 trustee credentials required" },
        { status: 400 }
      );
    }

    // ── Validate exam exists ──────────────────────────────────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    // ── Fetch the two trustee shares from DB ──────────────────────────
    const trusteeIds = trustees.map((t: { trusteeId: string }) => t.trusteeId);
    const shares = await prisma.keyShare.findMany({
      where: { examId, trusteeId: { in: trusteeIds } },
    });

    if (shares.length < 2) {
      return NextResponse.json(
        { error: "Could not find shares for provided trustee IDs" },
        { status: 400 }
      );
    }

    // ── Map passwords to shares in correct order ──────────────────────
    const sharesWithPasswords = shares.map((share) => {
      const trusteeEntry = trustees.find(
        (t: { trusteeId: string }) => t.trusteeId === share.trusteeId
      );
      return {
        encryptedShare: share.encryptedShare,
        shareIv: share.shareIv,
        shareAuthTag: share.shareAuthTag,
        argon2Salt: share.argon2Salt,
        shareIndex: share.shareIndex,
        trusteeIndex: share.shareIndex,
        password: trusteeEntry?.password ?? "",
      };
    });

    const passwords = sharesWithPasswords.map((s) => s.password);

    // ── Reconstruct ExamKEK ───────────────────────────────────────────
    let examKEK: Buffer;
    try {
      examKEK = await reconstructKEK(sharesWithPasswords, passwords, examId);
    } catch {
      return NextResponse.json(
        { error: "Key reconstruction failed. Verify trustee passwords are correct." },
        { status: 400 }
      );
    }

    // ── Validate reconstructed key length ─────────────────────────────
    if (examKEK.length !== 32) {
      return NextResponse.json({ error: "Reconstructed key is invalid" }, { status: 500 });
    }

    // ── Cache ExamKEK in-process for the exam duration ────────────────
    const cacheTTL = exam.endTime.getTime() - Date.now() + 30 * 60 * 1000; // +30 min grace
    if (cacheTTL > 0) {
      examKEKCache.set(examId, examKEK);
      setTimeout(() => examKEKCache.delete(examId), cacheTTL);
    }

    console.log(`[reconstruct] ExamKEK reconstructed for exam ${examId} by ${actorId}`);

    return NextResponse.json({
      message: "ExamKEK reconstructed and cached. Exam is now ready for evaluation.",
      examId,
      cacheExpiresAt: new Date(Date.now() + cacheTTL).toISOString(),
    });

  } catch (err) {
    console.error("[reconstruct]", err);
    return NextResponse.json({ error: "Reconstruction failed" }, { status: 500 });
  }
}
